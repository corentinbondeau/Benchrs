# ============================================================
# bench_render.py — Dessine les détections d'un CACHE sur les
# frames réelles, pour validation VISUELLE par un humain.
#
#   python bench_render.py /tmp/v1_s4.pkl --n 8 --out /tmp/render
#
# Pour chaque frame échantillonnée :
#   • boîtes blanches   = joueurs détectés (COCO)
#   • cercle VERT       = ballon COCO
#   • cercle BLEU       = 2e détecteur (modèle ballon dédié)
#   • croix ROUGE       = point de trajectoire retenu par le pipeline
#
# Aucune inférence : tout vient du cache → très léger en mémoire.
# ============================================================
from __future__ import annotations

import argparse
import math
import os
import pickle

import cv2

import config as cfg
from bench_pipeline import build_records, load, merge_candidates


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("cache")
    ap.add_argument("--n", type=int, default=8, help="nb de frames réparties")
    ap.add_argument("--out", default="/tmp/render")
    ap.add_argument("--which", choices=["coco", "union"], default="union")
    args = ap.parse_args()

    c = load(args.cache)
    os.makedirs(args.out, exist_ok=True)
    n = c["analyzed"]
    h = c["median_player_h"]
    stride = c["stride"]
    fps_eff = c["fps_eff"]
    scale = c["scale"]

    coco = c["coco_balls"]
    ball2 = c.get("ball2") or [[] for _ in coco]
    cands = coco if args.which == "coco" else merge_candidates(
        coco, ball2, cfg.BALL_CUE_MERGE_RADIUS_FACTOR * 0.5 * h
    )

    from match_analyzer import interpolate_ball_track, select_ball_track
    ball_max_jump = cfg.BALL_MAX_JUMP_FACTOR * h * stride
    reacquire = max(1, cfg.BALL_REACQUIRE_FRAMES // stride)
    samples = select_ball_track(cands, ball_max_jump, fps_eff, reacquire_frames=reacquire)
    track = interpolate_ball_track(samples, fps_eff, max(1, cfg.BALL_INTERP_MAX_GAP // stride))
    chosen = {s.idx: (s.x, s.y, False) for s in samples}
    for s in track:
        if s.idx not in chosen:
            chosen[s.idx] = (s.x, s.y, True)

    cap = cv2.VideoCapture(c["video"])
    try:
        cap.set(cv2.CAP_PROP_ORIENTATION_AUTO, 1)
    except Exception:
        pass

    step = max(1, n // args.n)
    base = os.path.splitext(os.path.basename(args.cache))[0]
    for i in range(0, n, step):
        native = c["native_idxs"][i] if i < len(c["native_idxs"]) else i * stride
        try:
            cap.set(cv2.CAP_PROP_POS_FRAMES, native)
        except Exception:
            pass
        ok, frame = cap.read()
        if not ok or frame is None:
            continue
        if scale < 1.0:
            fw, fh = int(c["width"] * scale), int(c["height"] * scale)
            frame = cv2.resize(frame, (fw, fh))

        for row in c["persons"][i]:
            x1, y1, x2, y2 = (int(v) for v in row[:4])
            cv2.rectangle(frame, (x1, y1), (x2, y2), (255, 255, 255), 1)
        for (bx, by, bc) in coco[i]:
            cv2.circle(frame, (int(bx), int(by)), 6, (0, 255, 0), 2)
            cv2.putText(frame, f"{bc:.2f}", (int(bx) + 6, int(by)), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 255, 0), 1)
        for (bx, by, bc) in ball2[i]:
            cv2.circle(frame, (int(bx), int(by)), 8, (255, 160, 0), 2)
            cv2.putText(frame, "B2", (int(bx) + 8, int(by) + 12), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 160, 0), 1)
        if i in chosen:
            cx, cy, interp = chosen[i]
            col = (0, 0, 255) if not interp else (0, 128, 255)
            cv2.drawMarker(frame, (int(cx), int(cy)), col, cv2.MARKER_CROSS, 14, 2)
        t = i / fps_eff
        cv2.putText(frame, f"#{i} t={t:.1f}s nCOCO={len(coco[i])} nB2={len(ball2[i])}",
                    (8, 18), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
        path = os.path.join(args.out, f"{base}_{args.which}_f{i:04d}.png")
        cv2.imwrite(path, frame)

    cap.release()
    print(f"images écrites dans {args.out} (vert=COCO, bleu=modèle ballon, croix=trajectoire)")


if __name__ == "__main__":
    main()
