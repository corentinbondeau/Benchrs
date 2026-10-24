# ============================================================
# bench_events.py — Rend les frames autour de CHAQUE événement de
# la timeline (buts/tirs) pour validation VISUELLE par un humain.
#
#   python bench_events.py /tmp/union_e2e_v1.json --out /tmp/render_events/v1
#
# Fresh inference sur une petite fenêtre autour de chaque event
# (~15 frames × 2 modèles = quelques secondes) : pas de cache requis.
#
# Pour chaque frame :
#   • boîtes blanches = joueurs (COCO)
#   • cercle VERT     = ballon COCO
#   • cercle BLEU     = modèle ballon dédié
#   • bandeau titre   = temps + type de l'événement proche
# ============================================================
from __future__ import annotations

import argparse
import json
import os

import cv2

import config as cfg
from vision import detect_ball2, get_model


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("result_json")
    ap.add_argument("--video", default=None, help="défaut : lu dans le cache/méta")
    ap.add_argument("--out", default="/tmp/render_events")
    ap.add_argument("--pad", type=float, default=1.5, help="fenêtre ± autour de l'event (s)")
    ap.add_argument("--step", type=float, default=0.3, help="espacement des frames (s)")
    args = ap.parse_args()

    r = json.load(open(args.result_json, encoding="utf-8"))
    video = args.video
    if not video:
        # le chemin vidéo n'est pas dans le résultat : on suppose à côté
        raise SystemExit("--video est requis (chemin de la vidéo source)")
    fps = float(r["meta"]["fps"]) or 30.0
    events = r.get("timeline", [])
    if not events:
        raise SystemExit("timeline vide")

    base = os.path.splitext(os.path.basename(args.result_json))[0]
    os.makedirs(args.out, exist_ok=True)

    model = get_model()
    cap = cv2.VideoCapture(video)
    try:
        cap.set(cv2.CAP_PROP_ORIENTATION_AUTO, 1)
    except Exception:
        pass

    written = 0
    for ei, ev in enumerate(events):
        t0 = float(ev.get("t", 0.0))
        kind = ev.get("type", "?")
        team = ev.get("team", "?")
        tt = t0 - args.pad
        while tt <= t0 + args.pad:
            nf = int(round(tt * fps))
            if nf >= 0:
                try:
                    cap.set(cv2.CAP_PROP_POS_FRAMES, nf)
                except Exception:
                    pass
                ok, frame = cap.read()
                if ok and frame is not None:
                    res = model.predict(
                        source=frame,
                        conf=cfg.DETECT_CONFIDENCE,
                        imgsz=cfg.IMGSZ,
                        augment=cfg.AUGMENT,
                        verbose=False,
                        device=cfg.torch_device(),
                    )[0]
                    for box in res.boxes:
                        cid = int(box.cls[0])
                        x1, y1, x2, y2 = (int(v) for v in box.xyxy[0].tolist())
                        c = float(box.conf[0])
                        if cid == cfg.CLASS_SPORTS_BALL and c >= cfg.BALL_CONFIDENCE:
                            cv2.circle(frame, ((x1 + x2) // 2, (y1 + y2) // 2), 7,
                                       (0, 255, 0), 2)
                            cv2.putText(frame, f"COCO {c:.2f}",
                                        ((x1 + x2) // 2 + 8, (y1 + y2) // 2),
                                        cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 0), 1)
                        elif cid == cfg.CLASS_PERSON:
                            cv2.rectangle(frame, (x1, y1), (x2, y2),
                                          (255, 255, 255), 1)
                    for (bx, by, bc) in detect_ball2(frame):
                        cv2.circle(frame, (int(bx), int(by)), 9, (255, 160, 0), 2)
                        cv2.putText(frame, f"B2 {bc:.2f}", (int(bx) + 10, int(by) + 14),
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 160, 0), 1)
                    cv2.putText(
                        frame,
                        f"event#{ei} {kind} {team} @t={t0:.1f}s  |  frame t={tt:.1f}s",
                        (8, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2,
                    )
                    p = os.path.join(
                        args.out, f"{base}_ev{ei}_{kind}_t{tt:06.2f}.png"
                    )
                    cv2.imwrite(p, frame)
                    written += 1
            tt += args.step

    cap.release()
    print(f"{written} images écrites dans {args.out}")


if __name__ == "__main__":
    main()
