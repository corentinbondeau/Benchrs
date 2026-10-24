# ============================================================
# bench_cache.py — Cache de détections pour itérer SANS relancer YOLO.
#
# L'analyse d'une vidéo coûte ~30-90 s (résolution 1600 + TTA). Pour
# tester une heuristique de suivi/possession/tirs il serait absurde de
# relancer l'inférence à chaque fois : ce script capture AUSSI VITEMENT
# QUE POSSIBLE ce que le pipeline voit, puis toutes les expériences en
# aval se lisent depuis le cache (millisecondes au lieu de minutes).
#
#   python bench_cache.py /tmp/v1.mov /tmp/v1.pkl
#   python bench_cache.py /tmp/v1.mov /tmp/v1.pkl --stride 4
#
# Sauvegardé par frame analysée :
#   persons     : (cx, cy, h, conf, track_id) — track_id -1 si absent
#   colors      : couleur de torse HSV (NaN si absente)
#   coco_balls  : [(cx, cy, conf)] — détections COCO brutes
#   white_balls : [(cx, cy, score)] — candidats classiques (ball_cues)
#   scale / dims : pour rejouer exactement les seuils normalisés
# ============================================================
from __future__ import annotations

import argparse
import pickle
import sys
import time

import cv2
import numpy as np

import config as cfg
from ball_cues import (
    PersonBox,
    detect_white_ball_from_mask,
    white_mask,
)
from vision import Tracker, median_torso_color


def build_cache(
    video_path: str,
    stride: int = 1,
    progress: bool = True,
    ball_model_path: str | None = None,
    ball_imgsz: int | None = None,
    ball_conf: float = 0.05,
    ball_augment: bool = False,
) -> dict:
    """Lit la vidéo une fois et retourne le dict de cache."""
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise RuntimeError(f"Impossible d'ouvrir {video_path}")
    try:
        cap.set(cv2.CAP_PROP_ORIENTATION_AUTO, 1)
    except Exception:
        pass

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    frame_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    frame_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    native_total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 0

    # Même downscale que le pipeline (garde-fou mémoire/décodage).
    scale = min(
        1.0,
        cfg.MAX_VIDEO_WIDTH / frame_w if frame_w else 1.0,
        cfg.MAX_VIDEO_HEIGHT / frame_h if frame_h else 1.0,
    )
    do_scale = scale < 1.0

    tracker = Tracker()
    persons_out: list[np.ndarray] = []
    colors_out: list[np.ndarray] = []
    coco_out: list[list[tuple[float, float, float]]] = []
    white_out: list[list[tuple[float, float, float]]] = []
    ball2_out: list[list[tuple[float, float, float]]] = []
    masks_out: list[np.ndarray] = []
    idxs: list[int] = []
    native_idxs: list[int] = []

    # Détecteur ballon dédié optionnel (2e modèle, ex. football-ball-detection).
    ball_model = None
    ball_ids: list[int] = []
    if ball_model_path:
        from ultralytics import YOLO

        ball_model = YOLO(ball_model_path)
        ball_ids = [k for k, v in ball_model.names.items() if "ball" in str(v).lower()]
    ball_imgsz = ball_imgsz or cfg.IMGSZ

    heights: list[float] = []
    # Hauteur joueur pilotée par la 1re passe (refine à chaud non nécessaire :
    # on mémorise toutes les hauteurs puis on borne après coup).
    heights_pass1: list[float] = []

    idx = 0
    native_idx = 0
    t0 = time.time()
    warm = True
    mask_hw = [0, 0]

    while True:
        ok, frame = cap.read()
        if not ok or native_idx >= cfg.MAX_FRAMES:
            break
        if native_idx % stride != 0:
            native_idx += 1
            continue
        if do_scale:
            frame = cv2.resize(
                frame, (max(1, int(frame_w * scale)), max(1, int(frame_h * scale)))
            )

        objs = tracker.update(frame, idx)

        p_rows = []
        p_colors = []
        person_boxes: list[PersonBox] = []
        for b in objs.persons:
            col = median_torso_color(frame, b)
            tid = b.track_id if b.track_id is not None else -1
            p_rows.append((b.x1, b.y1, b.x2, b.y2, b.confidence, float(tid)))
            p_colors.append(
                col if col is not None else np.array([np.nan, np.nan, np.nan])
            )
            person_boxes.append(PersonBox(b.x1, b.y1, b.x2, b.y2))
            if b.height > 10:
                heights.append(float(b.height))
                if warm:
                    heights_pass1.append(float(b.height))

        # Hauteur de référence pour les cues : médiane dès que possible.
        ref_h = float(np.median(heights_pass1)) if heights_pass1 else 0.0
        if not ref_h and heights:
            ref_h = float(np.median(heights))

        persons_out.append(
            np.asarray(p_rows, dtype=np.float32).reshape(-1, 6)
        )
        colors_out.append(
            np.asarray(p_colors, dtype=np.float32).reshape(-1, 3)
        )
        coco_out.append([(b.cx, b.cy, b.confidence) for b in objs.balls])
        if ball_model is not None:
            res = ball_model.predict(
                source=frame, conf=ball_conf, imgsz=ball_imgsz,
                augment=ball_augment, verbose=False, device=cfg.torch_device(),
            )[0]
            cands = []
            for box in res.boxes:
                cid = int(box.cls[0])
                if ball_ids and cid not in ball_ids:
                    continue
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                cands.append(((x1 + x2) / 2, (y1 + y2) / 2, float(box.conf[0])))
            ball2_out.append(cands)
        else:
            ball2_out.append([])
        mask = white_mask(frame)
        mask_hw = [int(mask.shape[0]), int(mask.shape[1])]
        masks_out.append(np.packbits(mask.reshape(-1) > 0))
        white_out.append(detect_white_ball_from_mask(mask, person_boxes, ref_h))
        idxs.append(idx)
        native_idxs.append(native_idx)

        idx += 1
        native_idx += 1
        if idx >= 40:
            warm = False  # la médiane est stabilisée
        if progress and idx % 50 == 0:
            pct = native_idx / native_total * 100 if native_total else 0
            el = time.time() - t0
            print(
                f"  … {idx} frames ({pct:5.1f}%)  {el:5.1f}s",
                file=sys.stderr,
                flush=True,
            )

    cap.release()

    all_h = np.asarray(heights, dtype=np.float64) if heights else np.zeros(1)
    return {
        "video": video_path,
        "fps": fps,
        "native_fps": fps,
        "width": frame_w,
        "height": frame_h,
        "native_total": native_total,
        "scale": scale,
        "stride": stride,
        "fps_eff": fps / stride if stride else fps,
        "analyzed": idx,
        "persons": persons_out,
        "colors": colors_out,
        "coco_balls": coco_out,
        "white_balls": white_out,
        "ball2": ball2_out,
        "masks": masks_out,
        "mask_shape": mask_hw,
        "frame_idxs": idxs,
        "native_idxs": native_idxs,
        "median_player_h": float(np.median(all_h)) if len(all_h) else 40.0,
        "heights": all_h,
        "model": cfg.MODEL_NAME,
        "imgsz": cfg.IMGSZ,
        "augment": cfg.AUGMENT,
        "built_at": time.time(),
    }


def fill_ball2(
    cache: dict,
    ball_model_path: str,
    ball_imgsz: int | None = None,
    ball_conf: float = 0.05,
    ball_augment: bool = False,
    progress: bool = True,
) -> dict:
    """Complète un cache DÉJÀ construit avec un 2e détecteur ballon.

    Pourquoi une passe séparée ? Sur une machine à mémoire contrainte, charger
    DEUX modèles (COCO + ballon) dans le même process fait saturer la mémoire et
    le process GÈLE plusieurs minutes au bout de ~100-200 frames (swap). Une
    passe mono-modèle est stable. On relit donc la vidéo avec EXACTEMENT le même
    stride/downscale que le cache et on n'écrit que `ball2`.
    """
    from ultralytics import YOLO

    video_path = cache["video"]
    stride = int(cache["stride"])
    scale = float(cache["scale"])
    frame_w = int(cache["width"])
    frame_h = int(cache["height"])
    ball_imgsz = ball_imgsz or cfg.IMGSZ

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise RuntimeError(f"Impossible d'ouvrir {video_path}")
    try:
        cap.set(cv2.CAP_PROP_ORIENTATION_AUTO, 1)
    except Exception:
        pass

    ball_model = YOLO(ball_model_path)
    ball_ids = [k for k, v in ball_model.names.items() if "ball" in str(v).lower()]

    out: list[list[tuple[float, float, float]]] = []
    native_idx = 0
    t0 = time.time()
    while True:
        ok, frame = cap.read()
        if not ok or native_idx >= cfg.MAX_FRAMES:
            break
        if native_idx % stride != 0:
            native_idx += 1
            continue
        if scale < 1.0:
            frame = cv2.resize(
                frame, (max(1, int(frame_w * scale)), max(1, int(frame_h * scale)))
            )
        res = ball_model.predict(
            source=frame, conf=ball_conf, imgsz=ball_imgsz,
            augment=ball_augment, verbose=False, device=cfg.torch_device(),
        )[0]
        cands = []
        for box in res.boxes:
            cid = int(box.cls[0])
            if ball_ids and cid not in ball_ids:
                continue
            x1, y1, x2, y2 = box.xyxy[0].tolist()
            cands.append(((x1 + x2) / 2, (y1 + y2) / 2, float(box.conf[0])))
        out.append(cands)
        native_idx += 1
        if progress and len(out) % 100 == 0:
            print(
                f"  … ball {len(out)} frames  {time.time() - t0:5.1f}s",
                file=sys.stderr, flush=True,
            )
    cap.release()
    cache["ball2"] = out
    cache["ball2_model"] = ball_model_path
    cache["ball2_imgsz"] = ball_imgsz
    cache["ball2_conf"] = ball_conf
    cache["ball2_augment"] = ball_augment
    return cache


def main() -> None:
    ap = argparse.ArgumentParser(description="Cache de détections YOLO+CV")
    ap.add_argument("video", nargs="?")
    ap.add_argument("out", nargs="?")
    ap.add_argument("--stride", type=int, default=1)
    ap.add_argument("--ball-model", default=None)
    ap.add_argument("--ball-imgsz", type=int, default=None)
    ap.add_argument("--ball-conf", type=float, default=0.05)
    ap.add_argument("--ball-augment", action="store_true")
    ap.add_argument(
        "--fill-ball-cache", default=None,
        help="cache existant à compléter avec le modèle ballon (passe mono-modèle)",
    )
    args = ap.parse_args()

    t0 = time.time()
    if args.fill_ball_cache:
        if not args.ball_model:
            ap.error("--fill-ball-cache nécessite --ball-model")
        with open(args.fill_ball_cache, "rb") as fh:
            cache = pickle.load(fh)
        cache = fill_ball2(
            cache, args.ball_model,
            ball_imgsz=args.ball_imgsz, ball_conf=args.ball_conf,
            ball_augment=args.ball_augment,
        )
        with open(args.fill_ball_cache, "wb") as fh:
            pickle.dump(cache, fh, protocol=pickle.HIGHEST_PROTOCOL)
        out_path = args.fill_ball_cache
    else:
        if not args.video or not args.out:
            ap.error("video et out sont requis (ou --fill-ball-cache)")
        cache = build_cache(
            args.video,
            stride=args.stride,
            ball_model_path=args.ball_model,
            ball_imgsz=args.ball_imgsz,
            ball_conf=args.ball_conf,
            ball_augment=args.ball_augment,
        )
        with open(args.out, "wb") as fh:
            pickle.dump(cache, fh, protocol=pickle.HIGHEST_PROTOCOL)
        out_path = args.out

    n = cache["analyzed"]
    coco_hit = sum(1 for c in cache["coco_balls"] if c)
    white_hit = sum(1 for c in cache["white_balls"] if c)
    both = sum(1 for c, w in zip(cache["coco_balls"], cache["white_balls"]) if c and w)
    lines = [
        f"cache → {out_path}",
        f"  frames analysées : {n} (stride {cache['stride']}, "
        f"fps_eff {cache['fps_eff']:.2f})  {time.time() - t0:.1f}s",
        f"  hauteur joueur méd. : {cache['median_player_h']:.1f} px  "
        f"(échelle {cache['scale']:.3f})",
        f"  COCO ballon    : {coco_hit}/{n} frames ({100 * coco_hit / max(1, n):.1f} %)",
        f"  classique blanc: {white_hit}/{n} frames ({100 * white_hit / max(1, n):.1f} %)",
        f"  les deux        : {both}/{n} frames ({100 * both / max(1, n):.1f} %)",
    ]
    if any(cache["ball2"]):
        b2 = sum(1 for c in cache["ball2"] if c)
        lines.append(f"  ball-model      : {b2}/{n} frames ({100 * b2 / max(1, n):.1f} %)")
        # Union des DEUX détecteurs réseau (hypothèse ensemble).
        un = sum(1 for c, b in zip(cache["coco_balls"], cache["ball2"]) if c or b)
        lines.append(f"  union COCO+ball : {un}/{n} frames ({100 * un / max(1, n):.1f} %)")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
