# ============================================================
# bench_report.py — Statistiques sur un cache de détections.
#
#   python bench_report.py /tmp/v1_s4.pkl
#
# But : juger la QUALITÉ des signaux ballon SANS ground truth
# annotée (je ne peux pas regarder les images). Les métriques
# disponibles sont donc des mesures PROXIES :
#
#   • couverture   : sur combien de frames le signal émet-il ?
#   • redondance   : combien de candidats par frame (1 = propre,
#                    10 = bruit) ;
#   • accord       : le signal classique retombe-t-il sur la
#                    position du ballon COCO quand celui-ci est
#                    visible ? (accord 2 capteurs indépendants =
#                    forte probabilité que les DEUX voient le vrai
#                    ballon) ;
#   • unicité      : le candidat classique est-il SEUL dans le
#                    cadre (le vrai ballon l'est presque toujours) ;
#   • cohérence    : à quelle vitesse les positions choisies
#                    bougent-elles (le bruit produit des sauts).
# ============================================================
from __future__ import annotations

import argparse
import math
import pickle
import statistics

import numpy as np


def load(path: str) -> dict:
    with open(path, "rb") as fh:
        return pickle.load(fh)


def nearest(px: float, py: float, dets: list[tuple[float, float, float]]) -> float:
    best = float("inf")
    for d in dets:
        best = min(best, math.hypot(d[0] - px, d[1] - py))
    return best


def report(path: str) -> None:
    c = load(path)
    n = c["analyzed"]
    h = c["median_player_h"]
    coco = c["coco_balls"]
    white = c["white_balls"]
    persons = c["persons"]

    print(f"=== {path} ===")
    print(
        f"frames {n}  stride {c['stride']}  fps_eff {c['fps_eff']:.2f}  "
        f"{c['width']}x{c['height']}  joueur méd {h:.1f}px  modèle {c['model']} "
        f"@{c['imgsz']} TTA={c['augment']}"
    )

    n_coco = sum(1 for d in coco if d)
    n_white = sum(1 for d in white if d)
    counts_w = [len(d) for d in white]
    counts_c = [len(d) for d in coco]
    print("\n-- couverture / redondance --")
    print(f"  COCO   : {n_coco}/{n} frames ({100 * n_coco / n:.1f} %)  "
          f"candidats/frame moy {statistics.mean(counts_c):.2f}  max {max(counts_c)}")
    print(f"  class. : {n_white}/{n} frames ({100 * n_white / n:.1f} %)  "
          f"candidats/frame moy {statistics.mean(counts_w):.2f}  max {max(counts_w)}")

    # ── 2e détecteur réseau (modèle ballon dédié), si présent ──
    ball2 = c.get("ball2") or []
    if any(ball2):
        counts_b = [len(d) for d in ball2]
        n_b = sum(1 for d in ball2 if d)
        print("\n-- 2e détecteur (modèle ballon dédié) --")
        print(f"  ball2  : {n_b}/{n} frames ({100 * n_b / n:.1f} %)  "
              f"candidats/frame moy {statistics.mean(counts_b):.2f}  max {max(counts_b)}")
        agree_b = 0
        for i in range(n):
            if not coco[i] or not ball2[i]:
                continue
            dmin = min(
                (math.hypot(b[0] - cb[0], b[1] - cb[1]) for b in ball2[i] for cb in coco[i]),
                default=float("inf"),
            )
            if dmin <= 1.5 * h:
                agree_b += 1
        common = sum(1 for i in range(n) if coco[i] and ball2[i])
        if common:
            print(f"  accord ball2/COCO (≤1.5h) sur frames communes : "
                  f"{agree_b}/{common} ({100 * agree_b / common:.1f} %)")
        # Valeur COMPLÉMENTAIRE : ball2 émet là où COCO n'a RIEN (union).
        coco_only = sum(1 for i in range(n) if coco[i] and not ball2[i])
        b2_only = sum(1 for i in range(n) if ball2[i] and not coco[i])
        neither = sum(1 for i in range(n) if not coco[i] and not ball2[i])
        union = sum(1 for i in range(n) if coco[i] or ball2[i])
        print(f"  COCO seul {coco_only}  ·  ball2 seul {b2_only}  ·  "
              f"aucun {neither}  ·  UNION {union}/{n} ({100 * union / n:.1f} %)")
        # Union = liste fusionnée par frame (COCO ∪ ball2) pour les métriques.
        union_dets = [
            list(coco[i]) + list(ball2[i]) for i in range(n)
        ]
        counts_u = [len(d) for d in union_dets]
        print(f"  union candidats/frame moy {statistics.mean(counts_u):.2f}  "
              f"max {max(counts_u)}")
        vels_u: list[float] = []
        for i in range(1, n):
            if union_dets[i - 1] and union_dets[i]:
                vels_u.append(min(
                    math.hypot(a[0] - b[0], a[1] - b[1])
                    for a in union_dets[i - 1] for b in union_dets[i]
                ))
        if vels_u:
            vels_u.sort()
            print(f"  saut médian union : {statistics.median(vels_u):.0f} px  "
                  f"p90 {vels_u[int(.9 * len(vels_u))]:.0f}")

    # Accord entre les deux signaux (la référence est le ballon COCO).
    agree = 0
    both_frames = 0
    best_white_scores: list[float] = []
    orphan_white = 0  # candidats classiques LOIN de tout ballon COCO
    near_person_far = 0
    for i in range(n):
        if not coco[i]:
            continue
        both_frames += 1
        # meilleur candidat classique = celui le plus proche du COCO le + proche
        dmin = min((nearest(cb[0], cb[1], white[i]) for cb in coco[i]), default=float("inf"))
        if dmin <= 1.5 * h:
            agree += 1
        scores_near = [
            w[2] for w in white[i]
            if min((math.hypot(w[0] - cb[0], w[1] - cb[1]) for cb in coco[i]), default=9e9)
            <= 1.5 * h
        ]
        if scores_near:
            best_white_scores.append(max(scores_near))

    # Candidats classiques sans correspondance COCO (soit faux positifs,
    # soit ballon RATÉ par COCO — les deux nous intéressent).
    for i in range(n):
        if not coco[i]:
            continue
        for w in white[i]:
            d = min(
                (math.hypot(w[0] - cb[0], w[1] - cb[1]) for cb in coco[i]),
                default=float("inf"),
            )
            if d > 2.0 * h:
                orphan_white += 1

    print("\n-- accord des deux capteurs (réf = COCO) --")
    if both_frames:
        print(f"  classique ≥ proche du COCO (≤1.5h) : {agree}/{both_frames} "
              f"({100 * agree / both_frames:.1f} %)")
        if best_white_scores:
            print(f"  score classique EN accord        : moy "
                  f"{statistics.mean(best_white_scores):.2f}  "
                  f"méd {statistics.median(best_white_scores):.2f}")
        print(f"  candidats classiques « orphelins » (>2h de tout COCO) : "
              f"{orphan_white} sur {sum(counts_w)}")

    # Unicité : combien de frames ont exactement 1 candidat classique.
    uniq = sum(1 for d in white if len(d) == 1)
    print(f"\n-- unicité classique --")
    print(f"  frames avec EXACTEMENT 1 candidat : {uniq}/{n} ({100 * uniq / n:.1f} %)")

    # Personnes
    npers = [len(p) for p in persons]
    print(f"\n-- joueurs --")
    print(f"  moy {statistics.mean(npers):.1f}/frame  max {max(npers)}  "
          f"méd hauteur {h:.1f}px")

    # Cohérence temporelle : vitesse médiane des détections COCO (px/frame
    # analysée). Des sauts énormes = bruit ; des vitesses plausibles = suivi.
    vels_c: list[float] = []
    vels_w: list[float] = []
    for i in range(1, n):
        if coco[i - 1] and coco[i]:
            d = min(
                (math.hypot(a[0] - b[0], a[1] - b[1]) for a in coco[i - 1] for b in coco[i]),
                default=float("inf"),
            )
            vels_c.append(d)
        if white[i - 1] and white[i]:
            d = min(
                (math.hypot(a[0] - b[0], a[1] - b[1]) for a in white[i - 1] for b in white[i]),
                default=float("inf"),
            )
            vels_w.append(d)
    if vels_c:
        vels_c.sort()
        vels_w.sort()
        print(f"\n-- saut mini entre frames consécutives (px, réf h={h:.0f}) --")
        print(f"  COCO    méd {statistics.median(vels_c):.0f}  p90 {vels_c[int(.9 * len(vels_c))]:.0f}")
        print(f"  class.  méd {statistics.median(vels_w):.0f}  p90 {vels_w[int(.9 * len(vels_w))]:.0f}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("cache")
    args = ap.parse_args()
    report(args.cache)


if __name__ == "__main__":
    main()
