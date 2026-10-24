# ============================================================
# diag_goal_return.py — Pour CHAQUE candidat « but » accepté, montre
# ce que fait le ballon APRÈS l'arrivée (les ~3 s suivantes) :
# un vrai but = le ballon disparaît (filet) ou reste près de la ligne ;
# un dégagement/clearance = le ballon REvient profondément en jeu.
# S'appuie sur le cache de détection (aucune inférence).
# Usage: diag_goal_return.py [cache.pkl] [union|coco]
# ============================================================
from __future__ import annotations

import math
import sys

import numpy as np

import config as cfg
from bench_pipeline import build_records, load, merge_candidates
from match_analyzer import interpolate_ball_track, select_ball_track


def main() -> None:
    cache_path = sys.argv[1] if len(sys.argv) > 1 else "/tmp/benchrs_videos/v1_s4.pkl"
    which = sys.argv[2] if len(sys.argv) > 2 else "union"
    c = load(cache_path)
    h = c["median_player_h"]
    stride = c["stride"]
    fps_eff = c["fps_eff"]
    n = c["analyzed"]

    coco = c["coco_balls"]
    ball2 = c.get("ball2") or [[] for _ in coco]
    merge_radius = cfg.BALL_CUE_MERGE_RADIUS_FACTOR * 0.5 * h  # identique à bench_pipeline
    cands = coco if which == "coco" else merge_candidates(coco, ball2, merge_radius)

    ball_max_jump = cfg.BALL_MAX_JUMP_FACTOR * h * stride
    reacquire = max(1, cfg.BALL_REACQUIRE_FRAMES // stride)
    interp_gap = max(1, cfg.BALL_INTERP_MAX_GAP // stride)
    samples = select_ball_track(cands, ball_max_jump, fps_eff, reacquire_frames=reacquire)
    track = interpolate_ball_track(samples, fps_eff, interp_gap)

    records, team_map, model, fps_eff = build_records(c)
    for s in track:
        if 0 <= s.idx < n:
            records[s.idx].ball = (s.x, s.y)

    all_px = [p.x for rec in records for p in rec.persons.values()]
    all_py = [p.y for rec in records for p in rec.persons.values()]
    pitch_min_x = float(np.percentile(all_px, 1.0))
    pitch_max_x = float(np.percentile(all_px, 99.0))
    goal_center_y = float(np.median(all_py))
    goal_opening = h * cfg.GOAL_OPENING_FACTOR
    width = pitch_max_x - pitch_min_x
    reach = cfg.GOAL_REACH_FRACTION * width
    min_speed = cfg.GOAL_ARRIVAL_MIN_SPEED_FACTOR * h * stride
    window = max(2, cfg.GOAL_ARRIVAL_WINDOW)
    cooldown = int(1.5 * fps_eff)

    order = sorted(samples, key=lambda s: s.idx)
    print(f"# config={which}  h={h:.1f} stride={stride} fps_eff={fps_eff:.1f}")
    print(f"# min_x={pitch_min_x:.0f} max_x={pitch_max_x:.0f} reach={reach:.0f} "
          f"min_speed={min_speed:.1f} goal_center_y={goal_center_y:.0f} "
          f"opening/2={goal_opening / 2:.0f}")
    print(f"# samples réels={len(order)}")

    last = -10**6
    n_accept = 0
    for i in range(window, len(order)):
        cur = order[i]
        if cur.idx - last < cooldown:
            continue
        prev = order[i - window]
        span = cur.idx - prev.idx
        if span <= 0:
            continue
        vx = (cur.x - prev.x) / span
        vy = (cur.y - prev.y) / span
        if math.hypot(vx, vy) < min_speed:
            continue
        if abs(cur.y - goal_center_y) > goal_opening / 2:
            continue
        if vx < 0 and cur.x <= pitch_min_x + reach:
            side = "gauche"
        elif vx > 0 and cur.x >= pitch_max_x - reach:
            side = "droite"
        else:
            continue
        n_accept += 1

        win = order[max(0, i - window): i + 1]
        steps = [
            abs(win[k + 1].x - win[k].x) / max(1, win[k + 1].idx - win[k].idx)
            for k in range(len(win) - 1)
        ]
        max_step = max(steps) if steps else 0.0
        plaus = 2.0 * h * stride  # SHOT_MAX_STEP_FACTOR * h * stride

        after = [s for s in order if cur.idx < s.idx <= cur.idx + int(3 * fps_eff)]
        if side == "gauche":
            threshold = pitch_min_x + 3 * reach
            came_back = [s for s in after if s.x > threshold]
            deepest = max((s.x for s in after), default=float("nan"))
        else:
            threshold = pitch_max_x - 3 * reach
            came_back = [s for s in after if s.x < threshold]
            deepest = min((s.x for s in after), default=float("nan"))
        print(f"\n[ACCEPT #{n_accept} t={cur.t:.1f} {side}] v={math.hypot(vx, vy):.1f} "
              f"span={span} max_step={max_step:.0f} plaus={plaus:.0f}")
        print(f"  x entrée ={[round(s.x) for s in win]}")
        print(f"  y        ={[round(s.y) for s in win]}")
        print(f"  après 3s : n={len(after)} x={[round(s.x) for s in after[:16]]}"
              f"{'…' if len(after) > 16 else ''}")
        print(f"  revenu > {threshold:.0f} ? {'OUI (' + str(len(came_back)) + ' frames)' if came_back else 'non'}"
              f"  (deepest={deepest:.0f})")
        last = cur.idx

    print(f"\n# total acceptés : {n_accept}")


if __name__ == "__main__":
    main()
