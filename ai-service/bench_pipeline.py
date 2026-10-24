# ============================================================
# bench_pipeline.py — Rejoue le pipeline AVAL (possession, passes,
# tirs, buts) depuis un CACHE de détections, sans relancer YOLO.
#
#   python bench_pipeline.py /tmp/v1_s4.pkl
#
# Compare deux jeux de candidats ballon :
#   • coco   : détections COCO seules (comportement actuel du worker)
#   • union  : COCO ∪ modèle ballon dédié (l'ensembliste envisagé)
#
# Objectif : décider si l'ensemble améliore réellement les STATS
# (et pas seulement la couverture brute des frames).
# ============================================================
from __future__ import annotations

import argparse
import math
import pickle
import statistics
from collections import defaultdict

import numpy as np

import config as cfg
from match_analyzer import (
    BallSample,
    FrameRecord,
    Person,
    build_possession,
    classify_teams,
    count_passes,
    detect_goals,
    detect_shots,
    interpolate_ball_track,
    possession_owners,
    select_ball_track,
)
from tactics_metrics import (
    compute_physical,
    compute_pressure,
    compute_structure,
    possession_segments,
)


def load(path: str) -> dict:
    with open(path, "rb") as fh:
        return pickle.load(fh)


def merge_candidates(
    coco: list, ball2: list, merge_radius: float
) -> list[list[tuple[float, float, float]]]:
    """Union COCO ∪ ball2, en fusionnant les doublons proches.

    Deux détections à moins de `merge_radius` px = le MÊME ballon : on garde
    celle de plus haute confiance (évite de compter 2 candidats identiques).
    """
    out = []
    for c, b in zip(coco, ball2):
        cands = list(c)
        for bx, by, bc in b:
            dup = False
            for j, (cx, cy, cc) in enumerate(cands):
                if math.hypot(bx - cx, by - cy) <= merge_radius:
                    dup = True
                    if bc > cc:
                        cands[j] = (bx, by, bc)
                    break
            if not dup:
                cands.append((bx, by, bc))
        out.append(cands)
    return out


def build_records(cache: dict) -> tuple[list[FrameRecord], dict, float, float]:
    """Reconstruit les FrameRecord (sans ballon) + le modèle d'équipes."""
    n = cache["analyzed"]
    fps_eff = cache["fps_eff"]
    persons_rows = cache["persons"]
    colors = cache["colors"]

    records: list[FrameRecord] = []
    track_colors: dict[int, list[np.ndarray]] = defaultdict(list)
    max_samples = 60
    for i in range(n):
        rec = FrameRecord(idx=i, t=i / fps_eff, ball=None)
        rows = persons_rows[i]
        cols = colors[i]
        for k in range(len(rows)):
            x1, y1, x2, y2, conf, tid = rows[k]
            tid = int(tid)
            col = cols[k]
            color = None if np.any(np.isnan(col)) else col
            rec.persons[tid] = Person((x1 + x2) / 2, (y1 + y2) / 2, color)
            if tid >= 0 and color is not None and len(track_colors[tid]) < max_samples:
                track_colors[tid].append(color)
        records.append(rec)

    avg_colors = {tid: np.median(v, axis=0) for tid, v in track_colors.items() if v}
    track_counts = {tid: len(v) for tid, v in track_colors.items()}
    team_map, model = classify_teams(avg_colors, track_counts)
    return records, team_map, model, fps_eff


def run(cache: dict, candidates: list, tag: str) -> dict:
    n = cache["analyzed"]
    stride = cache["stride"]
    fps_eff = cache["fps_eff"]
    h = cache["median_player_h"]
    frame_w = cache["width"]

    records, team_map, model, fps_eff = build_records(cache)

    ball_max_jump = cfg.BALL_MAX_JUMP_FACTOR * h * stride
    reacquire = max(1, cfg.BALL_REACQUIRE_FRAMES // stride)
    interp_gap = max(1, cfg.BALL_INTERP_MAX_GAP // stride)

    samples = select_ball_track(candidates, ball_max_jump, fps_eff, reacquire_frames=reacquire)
    track = interpolate_ball_track(samples, fps_eff, interp_gap)
    for s in track:
        if 0 <= s.idx < n:
            records[s.idx].ball = (s.x, s.y)

    owners = possession_owners(records, team_map, model, fps_eff, h)
    pct0, pct1, meas = build_possession(owners, fps_eff)
    pass0, pass1 = count_passes(records, team_map, model, fps_eff, h, frame_w)
    shots = detect_shots(samples, records, team_map, model, frame_w, h, fps_eff, step_scale=float(stride))
    goals = detect_goals(samples, records, team_map, model, frame_w, h, fps_eff, step_scale=float(stride))

    # Métriques physiques / structure / pression (tactics_metrics).
    physical = compute_physical(records, team_map, model, h)
    structure = compute_structure(records, team_map, model, h)
    pressure = compute_pressure(records, team_map, model, h)
    segments = possession_segments(owners, records)

    def _fmt_side(d: dict, keys: tuple[str, ...]) -> str:
        return "  ".join(f"{k}={d[k]}" for k in keys)

    n_ball = sum(1 for r in records if r.ball is not None)
    print(f"\n### {tag}")
    print(f"  trajectoire : {len(samples)} échantillons réels → {n_ball}/{n} frames avec ballon")
    print(f"  possession  : {pct0:.1f}/{pct1:.1f}  (mesuré {meas:.1f}s, {len(segments)} segments ≥ {cfg.POSSESSION_SEGMENT_MIN_SEC:.0f}s)")
    print(f"  passes      : {pass0}/{pass1}")
    print(f"  tirs        : {sum(1 for s in shots if s['team']=='team1')}/"
          f"{sum(1 for s in shots if s['team']=='team2')}")
    print(f"  buts        : {len(goals)}")
    print(f"  physique    : T1[{_fmt_side(physical['team1'], ('distance_km', 'speed_avg_kmh', 'speed_max_kmh'))}]")
    print(f"                T2[{_fmt_side(physical['team2'], ('distance_km', 'speed_avg_kmh', 'speed_max_kmh'))}]")
    print(f"  structure   : T1[{_fmt_side(structure['team1'], ('depth_m', 'width_m', 'compactness_m'))}]")
    print(f"                T2[{_fmt_side(structure['team2'], ('depth_m', 'width_m', 'compactness_m'))}]")
    print(f"  pression    : T1[dist={pressure['team1']['avg_dist_m']}m near={pressure['team1']['near_ball_avg']}]")
    print(f"                T2[dist={pressure['team2']['avg_dist_m']}m near={pressure['team2']['near_ball_avg']}]")
    for s in shots[:12]:
        print(f"    t={s['t']:>6}  {s['type']:<5} {s['team']}  {s['note']}")
    return {
        "possession": (pct0, pct1), "meas": meas, "passes": (pass0, pass1),
        "shots": len(shots), "goals": len(goals),
        "physical": physical, "structure": structure, "pressure": pressure,
        "segments": len(segments),
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("cache")
    args = ap.parse_args()
    c = load(args.cache)

    coco = c["coco_balls"]
    ball2 = c.get("ball2") or [[] for _ in coco]
    h = c["median_player_h"]
    merge_r = cfg.BALL_CUE_MERGE_RADIUS_FACTOR * 0.5 * h  # ~rayon ballon

    print(f"=== {args.cache} ===")
    print(f"frames {c['analyzed']}  stride {c['stride']}  fps_eff {c['fps_eff']:.2f}  "
          f"{c['width']}x{c['height']}  joueur méd {h:.1f}px  merge_r {merge_r:.0f}px")

    run(c, coco, "COCO seul (worker actuel)")
    if any(ball2):
        union = merge_candidates(coco, ball2, merge_r)
        run(c, union, "UNION COCO + modèle ballon")
    else:
        print("\n(pas de ball2 dans ce cache — lancer --fill-ball-cache d'abord)")


if __name__ == "__main__":
    main()
