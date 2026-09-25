# ============================================================
# match_analyzer.py — Pipeline d'analyse d'un match
#
# Entrée  : chemin d'une vidéo locale (téléchargée par le worker).
# Sortie  : dict JSON-sérialisable avec lisiblement :
#   - metadata vidéo (fps, durée, résolution, nb frames)
#   - équipes détectées (couleurs de maillot) pour l'affichage UI
#   - stats globales : possession %, passes, tirs, tirs cadrés
#   - timeline des temps forts (tirs, buts probables)
#
# Stratégie en 2 temps sur UNE seule lecture :
#   1) Phase d'observation : on tracke, on échantillonne la couleur
#      de chaque joueur et on mémorise la position du ballon.
#   2) Phase d'analyse : clustering k-means (2 clusters) sur les
#      couleurs → assignation équipe 1 / équipe 2 (ou arbitre si la
#      couleur est trop éloignée), puis possession, passes et tirs.
#
# Les mesures sont des HEURISTIQUES vision 2D (sans calibration) :
# elles sont normalisées par la taille apparente des joueurs pour
# être robustes au zoom et à l'angle de prise de vue. Documentées
# en commentaire, elles sont calibrées pour des vidéos de match
# filmées en grand-angle pleine largeur de terrain.
# ============================================================
from __future__ import annotations

import math
from collections import defaultdict
from dataclasses import dataclass, field

import cv2
import numpy as np

import config as cfg
from vision import Box, FrameObjects, Tracker, hsv_distance, median_torso_color

# ─── Résultats intermédiaires ────────────────────────────────

@dataclass
class BallSample:
    """Échantillon de trajectoire du ballon."""

    idx: int
    t: float
    x: float
    y: float


@dataclass
class FrameRecord:
    """Snapshot par frame (positions des joueurs + du ballon)."""

    idx: int
    t: float
    ball: tuple[float, float] | None
    persons: dict[int, tuple[float, float]] = field(default_factory=dict)


# ─── Couleurs → hex (affichage UI) ───────────────────────────

def hsv_to_hex(hsv: np.ndarray) -> str:
    """Convertit une couleur HSV en hexadécimal pour le front.
    On sature et éclaircit la couleur (identité visuelle d'équipe)."""
    h, s, v = (float(hsv[0]), float(min(255, hsv[1] * 1.4)), float(min(255, hsv[2] + 40)))
    hsv_bgr = cv2.cvtColor(
        np.uint8([[[h, s, v]]]), cv2.COLOR_HSV2BGR
    )[0][0]
    return "#{:02x}{:02x}{:02x}".format(int(hsv_bgr[2]), int(hsv_bgr[1]), int(hsv_bgr[0]))


# ─── Classification des équipes (couleur de maillot) ─────────

def classify_teams(
    track_colors: dict[int, np.ndarray],
) -> tuple[dict[int, int | None], np.ndarray, np.ndarray, list[int]]:
    """Assigne chaque track_id (joueur) à une équipe (0/1) ou à
    l'arbitre (None) via un k-means sur les couleurs de torse.

    Retourne : (mapping track→équipe, centroïdes HSV, seuil arbitre,
    couleurs hex des 2 équipes) — les hex servent à l'affichage.
    """
    items = [(tid, c) for tid, c in track_colors.items() if c is not None]
    team_map: dict[int, int | None] = {tid: None for tid in track_colors}

    if len(items) < 2:
        # Trop peu de couleurs : tout en "équipe 0" (analyse non fiable)
        for tid in team_map:
            team_map[tid] = 0
        return team_map, np.zeros(3), np.zeros(3), ["#4f46e5", "#dc2626"]

    colors = np.array([c for _, c in items], dtype=np.float32)
    crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 10, 1.0)
    _, _, centers = cv2.kmeans(
        colors, 2, None, crit, 5, cv2.KMEANS_PP_CENTERS
    )
    c0, c1 = centers[0], centers[1]

    # Distance inter-centres : si les 2 équipes ont quasi la même
    # couleur, on bascule en "équipe inconnue" plutôt que de mentir.
    inter = hsv_distance(c0, c1)
    referee_tol = max(42.0, inter * 0.6)
    ambiguous = inter < 25.0

    for tid, color in items:
        d0, d1 = hsv_distance(color, c0), hsv_distance(color, c1)
        nearest = 0 if d0 <= d1 else 1
        if ambiguous:
            team_map[tid] = 0
        elif min(d0, d1) > referee_tol or max(d0, d1) < 4.0:
            team_map[tid] = None  # arbitre / personne hors match
        else:
            team_map[tid] = nearest

    hex_colors = [hsv_to_hex(c0), hsv_to_hex(c1)]
    return team_map, c0, c1, hex_colors


# ─── Possession ──────────────────────────────────────────────

def build_possession(
    records: list[FrameRecord],
    team_map: dict[int, int | None],
    fps: float,
) -> tuple[float, float, float]:
    """Possession (secondes + %) mesurée frame à frame.

    Règle : à chaque frame, on cherche le joueur de chaque équipe le
    plus proche du ballon ; l'équipe du joueur le plus proche (à
    moins de POSSESSION_RADIUS px) "possède". Un hystérésis
    (POSSESSION_HOLD frames consécutives) évite le clignotement.
    """
    t0 = t1 = 0.0
    owner: int | None = None
    confirm = 0
    frame_dt = 1.0 / fps if fps > 0 else 1.0 / 30.0

    for rec in records:
        if not rec.ball or len(rec.persons) < 2:
            continue
        bx, by = rec.ball
        best: tuple[float, int] | None = None  # (dist, team)
        for tid, (px, py) in rec.persons.items():
            team = team_map.get(tid)
            if team is None:
                continue
            d = math.hypot(px - bx, py - by)
            if best is None or d < best[0]:
                best = (d, team)

        if best is None or best[0] > cfg.POSSESSION_RADIUS:
            continue

        cand = best[1]
        if cand == owner:
            confirm += 1
        else:
            confirm += 1
            if confirm >= cfg.POSSESSION_HOLD:
                owner = cand
                confirm = 0

        if owner == 0:
            t0 += frame_dt
        elif owner == 1:
            t1 += frame_dt

    total = t0 + t1
    pct0 = (t0 / total * 100.0) if total > 0 else 50.0
    pct1 = 100.0 - pct0
    return pct0, pct1, total


# ─── Passes ──────────────────────────────────────────────────

def count_passes(
    records: list[FrameRecord],
    team_map: dict[int, int | None],
    fps: float,
) -> tuple[int, int]:
    """Compte les passes : chaque BASCOULE durable de possession
    d'une équipe à l'autre est comptée comme une passe de l'équipe
    qui rend le ballon, si elle l'avait contrôlé assez longtemps
    (PASS_MIN_HOLD_SEC) — filtre les tocs et les interceptions
    immédiates.
    """
    min_hold_frames = max(1, int(cfg.PASS_MIN_HOLD_SEC * fps))
    owner: int | None = None
    run = 0
    passes: dict[int, int] = defaultdict(int)

    for rec in records:
        if not rec.ball or len(rec.persons) < 2:
            continue
        bx, by = rec.ball
        best: tuple[float, int] | None = None
        for tid, (px, py) in rec.persons.items():
            team = team_map.get(tid)
            if team is None:
                continue
            d = math.hypot(px - bx, py - by)
            if best is None or d < best[0]:
                best = (d, team)
        if best is None or best[0] > cfg.POSSESSION_RADIUS:
            continue

        cand = best[1]
        if cand == owner:
            run += 1
        else:
            if owner is not None and run >= min_hold_frames:
                passes[owner] += 1
            owner = cand
            run = 1

    return passes.get(0, 0), passes.get(1, 0)


# ─── Tirs ────────────────────────────────────────────────────

def detect_shots(
    ball_samples: list[BallSample],
    frame_records: list[FrameRecord],
    team_map: dict[int, int | None],
    frame_w: int,
    median_player_h: float,
    fps: float,
) -> list[dict]:
    """Détection heuristique des tirs + tirs cadrés.

    Principe : un tir est une accélération du ballon (vitesse
    élevée normalisée par la taille d'un joueur) dont la direction
    pointe vers l'un des deux buts.

    On estime les limites du terrain avec les positions des joueurs
    (percentiles 1%/99% sur x), la hauteur du but ≈ 4,1 × hauteur
    moyenne d'un joueur, centrée sur le y médian des joueurs.

    On projette la trajectoire du ballon (vitesse × horizon de 30
    frames) : si elle sort du terrain par le bord gauche/droit avec
    un y proche du centre du but → tir (cadré si le y d'arrivée est
    dans l'ouverture du but). Un cooldown évite de compter 2× le
    même tir. On signale un 'goal' probable quand le ballon dépasse
    franchement la ligne de but.
    """
    if median_player_h <= 0 or len(ball_samples) < 8:
        return []

    all_px = [p[0] for rec in frame_records for p in rec.persons.values()]
    all_py = [p[1] for rec in frame_records for p in rec.persons.values()]
    if not all_px:
        return []

    pitch_min_x = float(np.percentile(all_px, 1.0))
    pitch_max_x = float(np.percentile(all_px, 99.0))
    goal_center_y = float(np.median(all_py))
    goal_opening = median_player_h * cfg.GOAL_OPENING_FACTOR
    lookahead = max(8, int(0.5 * fps))  # ~0,5 s d'anticipation

    # Vitesse du ballon par frame (normalisée par la taille joueur)
    speeds: list[tuple[int, float]] = []  # (frame_idx, vitesse px/frame)
    prev = ball_samples[0]
    for s in ball_samples[1:]:
        d = math.hypot(s.x - prev.x, s.y - prev.y)
        if d <= cfg.POSSESSION_RADIUS * 0.9:  # saut brutal = détection parasite
            speeds.append((s.idx, d))
        prev = s
    if not speeds:
        return []

    by_idx = {s.idx: s for s in ball_samples}
    shots: list[dict] = []
    last_shot_frame = -10**6

    def nearest_sample(bound: int) -> BallSample | None:
        """Retourne l'échantillon de trajectoire le plus proche de la
        frame `bound` (pour lire l'état du ballon un peu plus tard)."""
        best = None
        for s in ball_samples:
            if s.idx >= bound:
                best = s
                break
        return best or (ball_samples[-1] if ball_samples else None)

    for idx, v in speeds:
        if idx - last_shot_frame < int(1.5 * fps):
            continue
        ratio = v / median_player_h
        if ratio < cfg.SHOT_SPEED_RATIO:
            continue

        s = by_idx.get(idx)
        if s is None:
            continue
        # Direction → bord du terrain sur l'horizon de tir
        next_ahead = by_idx.get(idx + lookahead)
        if next_ahead is None:
            next_ahead = by_idx.get(idx + max(4, lookahead // 3))
        if next_ahead is None:
            continue

        dx = next_ahead.x - s.x
        if abs(dx) < 1e-6:
            continue
        vel_x = dx / max(1, next_ahead.idx - s.idx)

        # Projette l'impact sur la ligne de but ciblée
        if vel_x < 0:
            goal_x = pitch_min_x
        else:
            goal_x = pitch_max_x

        t_hit = (goal_x - s.x) / vel_x
        if t_hit <= 0 or t_hit > 4 * fps:
            continue  # ne finit pas sur un but sous l'horizon

        y_hit = s.y + ((next_ahead.y - s.y) / max(1, next_ahead.idx - s.idx)) * t_hit
        on_target = abs(y_hit - goal_center_y) <= goal_opening / 2

        # Équipe qui tire : le possesseur du moment
        team: int | None = None
        for rec in frame_records:
            if rec.idx > idx:
                break
            if not rec.ball or len(rec.persons) < 2:
                continue
            bx, by = rec.ball
            best: tuple[float, int] | None = None
            for tid, (px, py) in rec.persons.items():
                team_t = team_map.get(tid)
                if team_t is None:
                    continue
                d = math.hypot(px - bx, py - by)
                if best is None or d < best[0]:
                    best = (d, team_t)
            if best is not None and best[0] <= cfg.POSSESSION_RADIUS:
                team = best[1]
        team = team if team is not None else (0 if vel_x > 0 else 1)

        # But probable : le ballon a dépassé franchement la ligne de but
        beyond = nearest_sample(idx + int(t_hit))
        is_goal = bool(
            beyond
            and (beyond.x < pitch_min_x - 5 or beyond.x > pitch_max_x + 5)
        )

        event_type = "goal" if is_goal else "shot"
        side = "gauche" if vel_x < 0 else "droite"
        shots.append(
            {
                "t": round(s.t, 1),
                "type": event_type,
                "team": f"team{team + 1}",
                "on_target": on_target,
                "note": f"Tir {'cadré' if on_target else 'non cadré'} côté {side}",
            }
        )
        last_shot_frame = idx

    return shots


# ─── Pipeline principal ──────────────────────────────────────

def analyze_video(
    video_path: str,
    progress_cb=None,
) -> dict:
    """Déroule une vidéo et produit le rapport JSON attendu par le
    front. `progress_cb(pct)` est appelé régulièrement (0→100)."""
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise RuntimeError(f"Impossible d'ouvrir la vidéo : {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    frame_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    frame_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 0
    if total <= 0:
        total = cfg.MAX_FRAMES

    tracker = Tracker()
    records: list[FrameRecord] = []
    ball_samples: list[BallSample] = []
    track_colors: dict[int, list[np.ndarray]] = defaultdict(list)
    median_heights: list[float] = []

    warmup_end = max(30, int(fps * cfg.WARMUP_SEC))
    idx = 0

    def report(force: bool = False) -> None:
        if progress_cb and (idx % 20 == 0 or force) and total:
            progress_cb(int(min(100.0, idx / total * 100.0)))

    while True:
        ok, frame = cap.read()
        if not ok or idx >= cfg.MAX_FRAMES:
            break

        objects: FrameObjects = tracker.update(frame, idx)
        t = idx / fps
        record = FrameRecord(idx=idx, t=t, ball=None)
        for b in objects.persons:
            record.persons[b.track_id] = (b.cx, b.cy)
            height = b.height
            if height > 10:  # ignore minuscules faux positifs
                median_heights.append(float(height))
            if idx < warmup_end and b.track_id is not None:
                col = median_torso_color(frame, b)
                if col is not None:
                    track_colors[b.track_id].append(col)
        if objects.balls:
            ball = max(objects.balls, key=lambda b: b.confidence)
            record.ball = (ball.cx, ball.cy)
            ball_samples.append(BallSample(idx=idx, t=t, x=ball.cx, y=ball.cy))

        records.append(record)
        report()
        idx += 1

    cap.release()
    report(force=True)

    if idx == 0:
        raise RuntimeError("La vidéo est vide ou corrompue")

    # Couleur médiane par joueur (robuste aux mouvements)
    avg_colors: dict[int, np.ndarray] = {
        tid: np.median(vals, axis=0) for tid, vals in track_colors.items() if vals
    }
    team_map, _, _, hex_colors = classify_teams(avg_colors)

    median_player_h = (
        float(np.median(median_heights)) if median_heights else 40.0
    )

    pct0, pct1, meas_sec = build_possession(records, team_map, fps)
    pass0, pass1 = count_passes(records, team_map, fps)

    computed_team_map = team_map
    shots = detect_shots(
        ball_samples, records, computed_team_map, frame_w, median_player_h, fps
    )

    shots0 = sum(1 for s in shots if s["team"] == "team1")
    shots1 = sum(1 for s in shots if s["team"] == "team2")
    sot0 = sum(1 for s in shots if s["team"] == "team1" and s["on_target"])
    sot1 = sum(1 for s in shots if s["team"] == "team2" and s["on_target"])

    result = {
        "schema_version": 1,
        "model": cfg.MODEL_NAME,
        "meta": {
            "fps": round(fps, 2),
            "width": frame_w,
            "height": frame_h,
            "frames": idx,
            "duration_sec": round(idx / fps, 2),
            "analyzed_frames": idx,
        },
        "teams": {
            "team1": {"label": "Équipe 1", "color": hex_colors[0]},
            "team2": {"label": "Équipe 2", "color": hex_colors[1]},
        },
        "stats": {
            "possession": {
                "team1": round(pct0, 1),
                "team2": round(pct1, 1),
                "measured_sec": round(meas_sec, 1),
            },
            "passes": {"team1": pass0, "team2": pass1},
            "shots": {"team1": shots0, "team2": shots1},
            "shots_on_target": {"team1": sot0, "team2": sot1},
        },
        "timeline": shots,
    }
    return result