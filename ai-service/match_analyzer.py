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
import time
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

    Règle : à chaque frame où le ballon est suivi, on cherche le joueur
    de chaque équipe le plus proche du ballon. Si un joueur connu est à
    moins de POSSESSION_RADIUS px (une « touche »), l'équipe du joueur
    devient candidate ; un hystérésis (POSSESSION_HOLD frames) évite le
    clignotement. Si le ballon est suivi mais loin de tout joueur (ballon
    en l'air, passe), le DERNIER possesseur garde la possession — sans
    cela, un ballon en vol ne comptait pour personne et la possession
    n'était mesurée que sur les quelques frames de contact (~1 s), ce qui
    donnait des pourcentages absurdes.

    Le temps « mesuré » = durée pendant laquelle le ballon est suivi et
    la possession attribuée (dénominateur du %).
    """
    t0 = t1 = 0.0
    owner: int | None = None
    pending: int | None = None
    pending_n = 0
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

        # Touche : un joueur connu est proche du ballon → candidat au
        # changement de possesseur (avec hystérésis).
        if best is not None and best[0] <= cfg.POSSESSION_RADIUS:
            cand = best[1]
            if cand == owner:
                pending = None
                pending_n = 0
            elif cand == pending:
                pending_n += 1
                if pending_n >= cfg.POSSESSION_HOLD:
                    owner = cand
                    pending = None
                    pending_n = 0
            else:
                pending = cand
                pending_n = 1
            if owner is None:
                owner = cand
        # Sinon : ballon en vol → le dernier possesseur garde la balle.

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
    median_player_h: float,
) -> tuple[int, int]:
    """Compte les passes complétées.

    Méthode « vol de balle » : à chaque fois que le ballon QUITTE un joueur
    (il sort du rayon de possession `POSSESSION_RADIUS`), on mémorise
    l'équipe qui l'a relâché ; quand le ballon est de nouveau CONTROLA (par
    un joueur à portée) par la MÊME équipe après avoir parcouru au moins
    `PASS_MIN_DIST_FACTOR × hauteur joueur`, c'est une passe complétée.
    Un contrôle par l'équipe adverse n'est PAS une passe (interception).

    On ne compte donc plus les micro-changements de « joueur le plus proche »
    (avant, la moindre fluctuation du plus proche voisin gonflait le compte
    ou, à l'inverse, un ballon jamais à portée donnait 0 passe).
    """
    min_travel = cfg.PASS_MIN_DIST_FACTOR * median_player_h
    owner_team: int | None = None
    flying = False
    release_team: int | None = None
    release_pos: tuple[float, float] | None = None
    passes: dict[int, int] = defaultdict(int)

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

        touched = best is not None and best[0] <= cfg.POSSESSION_RADIUS
        if touched:
            team = best[1]
            if flying:
                travel = (
                    math.hypot(bx - release_pos[0], by - release_pos[1])
                    if release_pos
                    else 0.0
                )
                if travel >= min_travel and team == release_team:
                    passes[team] += 1
                flying = False
                release_team = None
                release_pos = None
            owner_team = team
        elif owner_team is not None and not flying:
            # Le ballon quitte le porteur → phase de vol.
            flying = True
            release_team = owner_team
            release_pos = (bx, by)

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
    pointe vers l'un des deux buts, ET qui se poursuit (le ballon
    continue dans la même direction). Un pic isolé — la détection du
    ballon saute puis revient, déplacement net ≈ 0 — est rejeté : c'est
    le faux positif le plus fréquent.

    On estime les limites du terrain avec les positions des joueurs
    (percentiles 1%/99% sur x), la hauteur du but ≈ 4,1 × hauteur
    moyenne d'un joueur, centrée sur le y médian des joueurs.

    On projette la trajectoire du ballon vers le bord du terrain : si
    elle sort par le bord gauche/droit avec un y proche du centre du but
    → tir (cadré si le y d'arrivée est dans l'ouverture du but). Un
    cooldown évite de compter 2× le même tir. On signale un 'goal'
    probable quand le ballon dépasse franchement la ligne de but.
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

    # Déplacements du ballon entre frames CONSÉCUTIVES uniquement. Une
    # ré-acquisition après un trou (le ballon peut réapparaître ailleurs) est
    # un saut de position, pas une vitesse : le test de contiguïté
    # `b.idx - a.idx == 1` l'écarte déjà. On borne en plus le saut par
    # `POSSESSION_RADIUS` pour ignorer un faux positif franc (ballon détecté
    # ailleurs sur UNE seule frame, ex. la tête d'un joueur).
    max_plausible = cfg.POSSESSION_RADIUS
    order = sorted(ball_samples, key=lambda s: s.idx)
    if len(order) < 8:
        return []

    def sample_from(bound: int) -> BallSample | None:
        """Premier échantillon à une frame >= `bound` (None si aucun)."""
        for s in order:
            if s.idx >= bound:
                return s
        return None

    shots: list[dict] = []
    last_shot_frame = -10**6
    cooldown = int(1.5 * fps)
    momentum_horizon = max(3, int(0.2 * fps))
    momentum_factor = 1.5  # le ballon doit poursuivre ≥ 1,5× le saut initial

    for i in range(1, len(order)):
        a, b = order[i - 1], order[i]
        idx = b.idx
        if idx - a.idx != 1:
            continue
        dx, dy = b.x - a.x, b.y - a.y
        step_len = math.hypot(dx, dy)
        if step_len <= 0 or step_len > max_plausible:
            continue
        # Vitesse normalisée par la taille d'un joueur.
        if step_len / median_player_h < cfg.SHOT_SPEED_RATIO:
            continue
        if idx - last_shot_frame < cooldown:
            continue

        # Momentum : un vrai tir CONTINUE dans la même direction. Un faux
        # positif (la détection saute puis revient, net ≈ 0) échoue ici : le
        # déplacement net depuis la position de départ, projeté sur la
        # direction du saut, doit valoir au moins `momentum_factor × saut`.
        later = sample_from(idx + momentum_horizon)
        if later is None or later.idx <= a.idx:
            continue
        nx, ny = later.x - a.x, later.y - a.y
        projected = (dx * nx + dy * ny) / step_len  # net projeté sur le saut
        if projected < momentum_factor * step_len:
            continue

        # Direction globale (départ → plus tard) : plus stable que le saut.
        span = later.idx - a.idx
        vel_x = nx / span
        vel_y = ny / span
        if abs(vel_x) < 1e-6:
            continue

        s = a  # dernière frame « lente » = instant de la frappe
        # Projette l'impact sur la ligne de but ciblée
        if vel_x < 0:
            goal_x = pitch_min_x
        else:
            goal_x = pitch_max_x

        t_hit = (goal_x - s.x) / vel_x
        if t_hit <= 0 or t_hit > 4 * fps:
            continue  # ne finit pas sur un but sous l'horizon

        y_hit = s.y + vel_y * t_hit
        on_target = abs(y_hit - goal_center_y) <= goal_opening / 2

        # Équipe qui tire : le possesseur du moment
        team: int | None = None
        for rec in frame_records:
            if rec.idx > s.idx:
                break
            if not rec.ball or len(rec.persons) < 2:
                continue
            bx, by = rec.ball
            best: tuple[float, int] | None = None
            for tid, (px, py) in rec.persons.items():
                team_t = team_map.get(tid)
                if team_t is None:
                    continue
                dd = math.hypot(px - bx, py - by)
                if best is None or dd < best[0]:
                    best = (dd, team_t)
            if best is not None and best[0] <= cfg.POSSESSION_RADIUS:
                team = best[1]
        team = team if team is not None else (0 if vel_x > 0 else 1)

        # But probable : le ballon a dépassé franchement la ligne de but
        beyond = sample_from(s.idx + int(t_hit))
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
        last_shot_frame = s.idx

    return shots


# ─── Suivi de la trajectoire du ballon ───────────────────────

def select_ball_track(
    candidates: list[list[tuple[float, float, float]]],
    max_jump: float,
    fps: float,
) -> list[BallSample]:
    """Sélectionne UNE trajectoire de ballon cohérente frame à frame.

    Le détecteur sort beaucoup de faux positifs isolés ; prendre à chaque
    frame la détection la plus confiante produit une trajectoire qui saute
    de 900 px et fausse tous les calculs (possessions, tirs). Ici on suit
    la détection la plus proche de la position PRÉDITE (position + vitesse),
    en rejetant les sauts > `max_jump`. Après `BALL_REACQUIRE_FRAMES` frames
    sans ballon, on ré-acquiert la détection la plus confiante (le ballon
    peut être sorti du cadre ou masqué un instant).
    """
    samples: list[BallSample] = []
    prev: tuple[float, float] | None = None
    vx = vy = 0.0
    gap = 0

    for idx, dets in enumerate(candidates):
        if not dets:
            gap += 1
            continue

        if prev is None:
            chosen = max(dets, key=lambda d: d[2])
        else:
            px, py = prev[0] + vx, prev[1] + vy
            chosen = min(dets, key=lambda d: math.hypot(d[0] - px, d[1] - py))
            if math.hypot(chosen[0] - px, chosen[1] - py) > max_jump:
                gap += 1
                if gap < cfg.BALL_REACQUIRE_FRAMES:
                    continue
                chosen = max(dets, key=lambda d: d[2])

        if prev is not None:
            vx, vy = chosen[0] - prev[0], chosen[1] - prev[1]
        prev = (chosen[0], chosen[1])
        gap = 0
        samples.append(BallSample(idx=idx, t=idx / fps, x=chosen[0], y=chosen[1]))

    return samples


# ─── Pipeline principal ──────────────────────────────────────

def analyze_video(
    video_path: str,
    progress_cb=None,
) -> dict:
    """Déroule une vidéo et produit le rapport JSON attendu par le
    front. `progress_cb(pct)` est appelé régulièrement (0→100)."""
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise RuntimeError("Impossible d'ouvrir la vidéo")

    # GOTCHA smartphone : une vidéo filmée en portrait est stockée "couchée"
    # avec un flag de rotation (CAP_PROP_ORIENTATION_META != 0). Par défaut
    # OpenCV n'applique PAS la rotation → les frames sortent tournées de 90°
    # et la détection (joueurs + ballon) s'effondre. On demande au décodeur
    # d'appliquer la rotation : la largeur/hauteur rapportées reflètent alors
    # l'orientation réelle (et le downscale ci-dessous porte sur les bonnes
    # dimensions). Ne JAMAIS re-tourner manuellement avec ORIENTATION_META :
    # le flag reste à sa valeur d'origine même quand AUTO a déjà tourné.
    try:
        cap.set(cv2.CAP_PROP_ORIENTATION_AUTO, 1)
    except Exception:
        pass

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    frame_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    frame_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 0
    if total <= 0:
        total = cfg.MAX_FRAMES

    # Garde-fous anti-DoS : résolution d'analyse plafonnée (downscale),
    # temps de calcul borné (HARD_TIMEOUT_SEC), frames bornées.
    scale = min(
        1.0,
        cfg.MAX_VIDEO_WIDTH / frame_w if frame_w else 1.0,
        cfg.MAX_VIDEO_HEIGHT / frame_h if frame_h else 1.0,
    )
    do_scale = scale < 1.0
    hard_deadline = time.monotonic() + cfg.HARD_TIMEOUT_SEC

    tracker = Tracker()
    records: list[FrameRecord] = []
    ball_candidates: list[list[tuple[float, float, float]]] = []
    track_colors: dict[int, list[np.ndarray]] = defaultdict(list)
    median_heights: list[float] = []

    # On échantillonne la couleur du maillot de CHAQUE track tout au long de
    # la vidéo (pas seulement pendant un « warmup » de quelques secondes) :
    # ByteTrack réattribue de nouveaux ids quand une piste est perdue (joueurs
    # petits/loin, occlusions), si bien que les ids du début ne couvrent pas
    # ceux de la fin. Classifier sur les seuls ids du warmup laissait des
    # joueurs sans équipe → possession/passes = 0. Le plafond par track borne
    # le coût et privilégie les premières détections (plus fiables).
    max_color_samples = 60

    idx = 0

    def report(force: bool = False) -> None:
        if progress_cb and (idx % 20 == 0 or force) and total:
            progress_cb(int(min(100.0, idx / total * 100.0)))

    while True:
        ok, frame = cap.read()
        if not ok or idx >= cfg.MAX_FRAMES:
            break
        if time.monotonic() > hard_deadline:
            cap.release()
            raise RuntimeError(f"Temps d'analyse maximal dépassé ({cfg.HARD_TIMEOUT_SEC} s)")

        if do_scale:
            frame = cv2.resize(
                frame, (max(1, int(frame_w * scale)), max(1, int(frame_h * scale)))
            )

        objects: FrameObjects = tracker.update(frame, idx)
        t = idx / fps
        record = FrameRecord(idx=idx, t=t, ball=None)
        for b in objects.persons:
            record.persons[b.track_id] = (b.cx, b.cy)
            height = b.height
            if height > 10:  # ignore minuscules faux positifs
                median_heights.append(float(height))
            if b.track_id is not None:
                bucket = track_colors[b.track_id]
                if len(bucket) < max_color_samples:
                    col = median_torso_color(frame, b)
                    if col is not None:
                        bucket.append(col)
        if objects.balls:
            ball_candidates.append(
                [(b.cx, b.cy, b.confidence) for b in objects.balls]
            )
        else:
            ball_candidates.append([])

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

    # Trajectoire du ballon filtrée (rejette les faux positifs isolés) puis
    # réinjectée dans les enregistrements pour possession/passes.
    ball_max_jump = cfg.BALL_MAX_JUMP_FACTOR * median_player_h
    ball_samples = select_ball_track(ball_candidates, ball_max_jump, fps)
    for s in ball_samples:
        if 0 <= s.idx < len(records):
            records[s.idx].ball = (s.x, s.y)

    pct0, pct1, meas_sec = build_possession(records, team_map, fps)
    pass0, pass1 = count_passes(records, team_map, fps, median_player_h)

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
        "timeline": shots[: cfg.MAX_TIMELINE],
    }
    return result