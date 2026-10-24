# ============================================================
# bench_model.py — Mesure la détection « ballon » d'un modèle YOLO
# arbitraire sur une vidéo, et son accord avec le cache COCO.
#
#   python bench_model.py /tmp/v1.mov /tmp/ball.pt --stride 4 \
#          --imgsz 1280 1600 --conf 0.05 0.25
#
# Comparer plusieurs modèles / résolutions / seuils sur les MÊMES
# frames est la seule façon objective de choisir, sans ground truth
# annotée. Métriques : couverture (frames avec ≥1 ballon),
# candidats/frame (propreté), accord avec le ballon COCO du cache.
# ============================================================
from __future__ import annotations

import argparse
import math
import pickle

import cv2
import numpy as np
from ultralytics import YOLO

import config as cfg


def run(
    video: str,
    model_path: str,
    stride: int,
    imgsz: int,
    conf: float,
    cache: dict | None,
    augment: bool = False,
) -> dict:
    cap = cv2.VideoCapture(video)
    cap.set(cv2.CAP_PROP_ORIENTATION_AUTO, 1)
    frame_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    frame_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    scale = min(
        1.0,
        cfg.MAX_VIDEO_WIDTH / frame_w if frame_w else 1.0,
        cfg.MAX_VIDEO_HEIGHT / frame_h if frame_h else 1.0,
    )
    model = YOLO(model_path)
    names = model.names
    ball_ids = [k for k, v in names.items() if "ball" in str(v).lower()]

    hits = 0
    n = 0
    counts: list[int] = []
    agree = 0
    coco_frames = 0
    native = 0
    dets_per_idx: dict[int, list] = {}

    while True:
        ok, frame = cap.read()
        if not ok:
            break
        if native % stride != 0:
            native += 1
            continue
        if scale < 1.0:
            frame = cv2.resize(
                frame, (max(1, int(frame_w * scale)), max(1, int(frame_h * scale)))
            )
        res = model.predict(
            source=frame, conf=conf, imgsz=imgsz, augment=augment,
            verbose=False, device=cfg.torch_device(),
        )[0]
        cands = []
        for box in res.boxes:
            cid = int(box.cls[0])
            if ball_ids and cid not in ball_ids:
                continue
            x1, y1, x2, y2 = box.xyxy[0].tolist()
            cands.append(((x1 + x2) / 2, (y1 + y2) / 2, float(box.conf[0])))
        dets_per_idx[n] = cands
        counts.append(len(cands))
        if cands:
            hits += 1
        n += 1
        native += 1

    cap.release()

    # Accord avec le ballon COCO (si cache fourni) : pour chaque frame où
    # COCO voit un ballon, le modèle est-il d'accord à ≤1.5 h ?
    if cache is not None:
        h = cache["median_player_h"]
        for i in range(min(n, cache["analyzed"])):
            cb = cache["coco_balls"][i]
            if not cb:
                continue
            coco_frames += 1
            d = min(
                (math.hypot(a[0] - b[0], a[1] - b[1]) for a in dets_per_idx[i] for b in cb),
                default=float("inf"),
            )
            if d <= 1.5 * h:
                agree += 1

    return {
        "n": n,
        "hits": hits,
        "coverage": hits / n if n else 0,
        "mean_cands": float(np.mean(counts)) if counts else 0,
        "max_cands": int(np.max(counts)) if counts else 0,
        "agree": agree / coco_frames if coco_frames else 0,
        "coco_frames": coco_frames,
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("model")
    ap.add_argument("--stride", type=int, default=4)
    ap.add_argument("--imgsz", type=int, nargs="+", default=[1280])
    ap.add_argument("--conf", type=float, nargs="+", default=[0.05])
    ap.add_argument("--cache", default=None)
    ap.add_argument("--augment", action="store_true")
    args = ap.parse_args()

    cache = None
    if args.cache:
        with open(args.cache, "rb") as fh:
            cache = pickle.load(fh)

    print(f"modèle {args.model}")
    for imgsz in args.imgsz:
        for conf in args.conf:
            r = run(
                args.video, args.model, args.stride, imgsz,
                conf, cache, augment=args.augment,
            )
            print(
                f"  imgsz {imgsz:5d} conf {conf:.2f} TTA={int(args.augment)} | "
                f"couv {100 * r['coverage']:5.1f}% "
                f"({r['hits']}/{r['n']})  cands/f {r['mean_cands']:5.2f} "
                f"max {r['max_cands']:3d}  accord {100 * r['agree']:5.1f}%"
            )


if __name__ == "__main__":
    main()
