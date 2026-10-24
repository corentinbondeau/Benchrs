# ============================================================
# bench_cues.py — Réglage rapide du détecteur classique depuis un cache.
#
#   python bench_cues.py /tmp/v1_s4.pkl          # config courante
#   python bench_cues.py /tmp/v1_s4.pkl --sweep  # balayage de seuils
#
# Le masque blanc est déjà en cache (bit-packé) : on rejoue taille /
# aspect / circularité / rejet-joueur en millisecondes, sans relire la
# vidéo ni relancer YOLO. C'est ce qui permet de régler les seuils « à
# l'aveugle » (je ne peux pas regarder les images) par des PROXIES :
#   • candidats/frame proche de 1  → signal propre (le ballon est seul) ;
#   • accord avec le ballon COCO   → les deux capteurs se confirment ;
#   • couverture                   → on couvre (en plus) les frames où
#                                    COCO rate le ballon.
# ============================================================
from __future__ import annotations

import argparse
import math
import pickle
import statistics
from collections import defaultdict

import numpy as np

import config as cfg
from ball_cues import PersonBox, detect_white_ball_from_mask


def unp_mask(packed: np.ndarray, shape) -> np.ndarray:
    bits = np.unpackbits(packed)[: shape[0] * shape[1]]
    return (bits.reshape(shape) * 255).astype(np.uint8)


def boxes_of(row: np.ndarray) -> list[PersonBox]:
    out = []
    for r in row:
        out.append(PersonBox(float(r[0]), float(r[1]), float(r[2]), float(r[3])))
    return out


def evaluate(cache: dict, verbose: bool = True) -> dict:
    n = cache["analyzed"]
    h = cache["median_player_h"]
    shape = tuple(cache["mask_shape"])
    coco = cache["coco_balls"]
    stats: dict = defaultdict(int)

    counts: list[int] = []
    near_coco = 0
    coco_frames = 0
    for i in range(n):
        mask = unp_mask(cache["masks"][i], shape)
        cands = detect_white_ball_from_mask(mask, boxes_of(cache["persons"][i]), h, stats)
        counts.append(len(cands))
        if coco[i]:
            coco_frames += 1
            d = min(
                (math.hypot(c[0] - cb[0], c[1] - cb[1]) for c in cands for cb in coco[i]),
                default=float("inf"),
            )
            if d <= 1.5 * h:
                near_coco += 1

    mean_c = statistics.mean(counts) if counts else 0
    uniq = sum(1 for c in counts if c == 1)
    anyc = sum(1 for c in counts if c > 0)
    res = {
        "mean_cands": mean_c,
        "max_cands": max(counts) if counts else 0,
        "coverage": anyc / n if n else 0,
        "unique": uniq / n if n else 0,
        "agree_coco": near_coco / coco_frames if coco_frames else 0,
        "coco_frames": coco_frames,
        "stats": dict(stats),
    }
    if verbose:
        print(f"  candidats/frame  moy {mean_c:6.2f}  max {max(counts) if counts else 0}")
        print(f"  couverture       {100 * anyc / n:5.1f} %")
        print(f"  unicité (==1)     {100 * uniq / n:5.1f} %")
        print(f"  accord COCO      {100 * res['agree_coco']:5.1f} %  ({coco_frames} frames COCO)")
        tot = stats.get("total", 1)
        print("  rejets : " + "  ".join(
            f"{k}={v} ({100 * v / tot:.0f}%)" for k, v in sorted(stats.items())
        ))
    return res


def sweep(cache: dict) -> None:
    """Balayage de la circularité et de la taille, à taille de masque fixe."""
    base = {
        "circ": cfg.BALL_BLOB_MIN_CIRCULARITY,
        "min_f": cfg.BALL_BLOB_MIN_FACTOR,
        "min_score": cfg.BALL_BLOB_MIN_SCORE,
        "person": True,
    }
    print("-- balayage circularité (taille fixe) --")
    for circ in (0.55, 0.65, 0.70, 0.75, 0.80, 0.85):
        cfg.BALL_BLOB_MIN_CIRCULARITY = circ
        r = evaluate(cache, verbose=False)
        print(f"  circ≥{circ:.2f}  cands {r['mean_cands']:6.2f}  "
              f"couv {100 * r['coverage']:5.1f}%  uniq {100 * r['unique']:5.1f}%  "
              f"accord {100 * r['agree_coco']:5.1f}%")
    cfg.BALL_BLOB_MIN_CIRCULARITY = base["circ"]

    print("-- balayage taille min (circ 0.70) --")
    cfg.BALL_BLOB_MIN_CIRCULARITY = 0.70
    for mf in (0.08, 0.12, 0.16, 0.20, 0.25):
        cfg.BALL_BLOB_MIN_FACTOR = mf
        r = evaluate(cache, verbose=False)
        print(f"  min_f={mf:.2f}   cands {r['mean_cands']:6.2f}  "
              f"couv {100 * r['coverage']:5.1f}%  uniq {100 * r['unique']:5.1f}%  "
              f"accord {100 * r['agree_coco']:5.1f}%")
    cfg.BALL_BLOB_MIN_FACTOR = base["min_f"]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("cache")
    ap.add_argument("--sweep", action="store_true")
    args = ap.parse_args()
    with open(args.cache, "rb") as fh:
        cache = pickle.load(fh)
    print(f"=== {args.cache}  ({cache['analyzed']} frames, "
          f"joueur {cache['median_player_h']:.1f}px) ===")
    if args.sweep:
        sweep(cache)
    else:
        evaluate(cache)


if __name__ == "__main__":
    main()
