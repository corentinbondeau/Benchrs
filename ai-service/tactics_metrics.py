# ============================================================
# tactics_metrics.py — Métriques PHYSIQUES et TACTIQUES
# dérivées des tracks de joueurs déjà collectés par le pipeline.
#
# Ces métriques n'utilisent PAS la détection du ballon (le signal
# le plus fragile) : elles se reposent sur les positions des
# joueurs trackés et leur classification d'équipe, collectées
# dans `analyze_video`. Elles enrichissent le rapport JSON sans
# ajouter de coût d'inférence.
#
# ATTENTE — calibration approximative : les positions sont en
# pixels d'image, sans homographie de terrain. On convertit en
# mètres via la hauteur apparente médiane d'un joueur
# (PHYSICS_PLAYER_HEIGHT_M ↔ median_player_h px). La perspective
# comprime le fond : les valeurs sont RELATIVES (comparaison
# entre équipes et tendances), pas des mesures GPS.
# ============================================================
from __future__ import annotations

import math
from collections import defaultdict

import numpy as np

import config as cfg
from match_analyzer import FrameRecord, TeamModel, person_team


def _meters_per_px(median_player_h: float) -> float:
    h = median_player_h if median_player_h and median_player_h > 0 else 40.0
    return cfg.PHYSICS_PLAYER_HEIGHT_M / max(1.0, h)


# ─── Physique (distance, vitesses) ──────────────────────────

def compute_physical(
    records: list[FrameRecord],
    team_map: dict[int, int | None],
    model: TeamModel,
    median_player_h: float,
) -> dict:
    """Distance parcourue et vitesses par équipe, estimées depuis les tracks.

    Pour chaque track classé à une équipe, on relie les positions
    CONSECUTIVES où il est présent (dt = écart réel entre frames analysées).
    Deux garde-fous anti-bruit de tracking :
      - un écart > PHYS_MAX_GAP_SEC sans le track = fragmentation ByteTrack
        (le « déplacement » serait un saut d'identifiant, pas un vrai cours) ;
      - une vitesse instantanée > PHYS_MAX_SPEED_KMH = téléportation de
        détection (boîte glitchée), pas un mouvement physique. Une borne en
        km/h (et non en pixels) tient dans toutes les cadences : à 50 fps,
        un simple seuil en multiples de hauteur laisserait passer ~1000 km/h.

    La vitesse MAX est bornée par l'échantillonnage (stride) : avec un pas
    de 0,1-0,25 s on observe des vitesses moyennes fiables, la pointe est
    sous-estimée — à lire comme un ordre de grandeur.
    """
    m_per_px = _meters_per_px(median_player_h)
    max_speed_ms = cfg.PHYS_MAX_SPEED_KMH / 3.6
    hi_ms = cfg.HIGH_INTENSITY_KMH / 3.6

    dist_m: dict[int, float] = defaultdict(float)       # équipe → mètres
    hi_m: dict[int, float] = defaultdict(float)         # équipe → m haute intensité
    speeds: dict[int, list[float]] = defaultdict(list)  # équipe → vitesses (m/s)
    tracks: dict[int, set[int]] = defaultdict(set)      # équipe → track_ids

    last_pos: dict[int, tuple[float, float, float]] = {}  # tid → (t, x, y)

    for rec in records:
        for tid, person in rec.persons.items():
            team = person_team(tid, person, team_map, model)
            if team is None:
                continue
            prev = last_pos.get(tid)
            last_pos[tid] = (rec.t, person.x, person.y)
            if prev is None:
                continue
            pt, px, py = prev
            dt = rec.t - pt
            if dt <= 0 or dt > cfg.PHYS_MAX_GAP_SEC:
                continue  # premier relevé après une fragmentation
            d_px = math.hypot(person.x - px, person.y - py)
            d_m = d_px * m_per_px
            speed = d_m / dt
            if speed > max_speed_ms:
                continue  # téléportation de détection
            dist_m[team] += d_m
            speeds[team].append(speed)
            tracks[team].add(tid)
            if speed >= hi_ms:
                hi_m[team] += d_m

    def side(team: int) -> dict:
        v = speeds.get(team, [])
        total_m = dist_m.get(team, 0.0)
        # Max = p99 (et non max absolu) : un glitch de boîte juste sous le cap
        # de 45 km/h ferait exploser le pic affiché ; le p99 reste stable.
        return {
            "players_tracked": len(tracks.get(team, set())),
            "distance_km": round(total_m / 1000.0, 3),
            "high_intensity_km": round(hi_m.get(team, 0.0) / 1000.0, 3),
            "speed_avg_kmh": round((sum(v) / len(v) * 3.6), 1) if v else 0.0,
            "speed_max_kmh": round(float(np.percentile(v, 99)) * 3.6, 1) if v else 0.0,
        }

    return {"team1": side(0), "team2": side(1)}


# ─── Structure du bloc (profondeur, largeur, compacité) ─────

def compute_structure(
    records: list[FrameRecord],
    team_map: dict[int, int | None],
    model: TeamModel,
    median_player_h: float,
) -> dict:
    """Structure d'équipe moyenne : effectif visible, profondeur, largeur,
    compacité du bloc.

    Sur chaque frame où une équipe a ≥ 2 joueurs détectés :
      - profondeur : amplitude (p10→p90) des positions le long de l'axe
        principal du terrain (x de l'image, la prise de vue est axée) ;
      - largeur : amplitude (p10→p90) perpendiculaire (y) ;
      - compacité : distance moyenne entre paires de coéquipiers.

    Un bloc COMPACT (faible compacité/profondeur) = repli défensif serré ;
    une grande profondeur = équipe étalée entre offense et défense. Les
    percentiles rejettent les joueurs isolés / hors-boîte qui faussaient
    les moyennes.
    """
    m_per_px = _meters_per_px(median_player_h)

    xs: dict[int, list[float]] = defaultdict(list)
    ys: dict[int, list[float]] = defaultdict(list)
    n_visible: dict[int, int] = defaultdict(int)
    pair_dists: dict[int, list[float]] = defaultdict(list)

    for rec in records:
        per_team_pos: dict[int, list[tuple[float, float]]] = defaultdict(list)
        for tid, person in rec.persons.items():
            team = person_team(tid, person, team_map, model)
            if team is None:
                continue
            per_team_pos[team].append((person.x, person.y))
        for team, pos in per_team_pos.items():
            n_visible[team] += len(pos)
            if len(pos) < 2:
                continue
            arr = np.array(pos, dtype=np.float32)
            xs[team].extend(arr[:, 0].tolist())
            ys[team].extend(arr[:, 1].tolist())
            # Compacité : paires (plafonnées pour le coût) — distance moyenne
            # entre coéquipiers sur cette frame.
            n = len(pos)
            pairs = min(n * (n - 1) // 2, 21)  # 7 joueurs → 21 paires max
            idx = 0
            for i in range(n):
                for j in range(i + 1, n):
                    if idx >= pairs:
                        break
                    pair_dists[team].append(
                        math.hypot(pos[i][0] - pos[j][0], pos[i][1] - pos[j][1])
                    )
                    idx += 1

    n_frames = max(1, len(records))

    def side(team: int) -> dict:
        fx = np.array(xs.get(team, []), dtype=np.float32)
        fy = np.array(ys.get(team, []), dtype=np.float32)
        pd = np.array(pair_dists.get(team, []), dtype=np.float32)
        if fx.size == 0:
            return {
                "players_visible_avg": 0.0,
                "depth_m": 0.0,
                "width_m": 0.0,
                "compactness_m": 0.0,
            }
        depth_px = float(np.percentile(fx, 90) - np.percentile(fx, 10))
        width_px = float(np.percentile(fy, 90) - np.percentile(fy, 10))
        return {
            "players_visible_avg": round(n_visible[team] / n_frames, 1),
            "depth_m": round(depth_px * m_per_px, 1),
            "width_m": round(width_px * m_per_px, 1),
            "compactness_m": round(float(pd.mean()) * m_per_px, 1) if pd.size else 0.0,
        }

    return {"team1": side(0), "team2": side(1)}


# ─── Timeline de possession ────────────────────────────────

def possession_segments(
    owners: list[int | None],
    records: list[FrameRecord],
    min_seg_sec: float | None = None,
) -> list[dict]:
    """Segments de possession fusionnés : [{t0, t1, team}].

    Part de la séquence des possesseurs (`possession_owners`, source unique
    avec les %) et fusionne les runs consécutifs ; les micro-segments
    (< POSSESSION_SEGMENT_MIN_SEC) sont absorbés dans le voisin pour ne pas
    clutterer le rendu (clignotements de hystérésis).
    """
    if not owners or not records:
        return []
    min_seg = (
        min_seg_sec
        if min_seg_sec is not None
        else cfg.POSSESSION_SEGMENT_MIN_SEC
    )
    segs: list[dict] = []
    cur_team: int | None = None
    cur_start = 0.0
    for i, owner in enumerate(owners):
        t = records[i].t if i < len(records) else records[-1].t
        if owner != cur_team:
            if cur_team is not None:
                segs.append({"t0": cur_start, "t1": t, "team": cur_team})
            cur_team = owner
            cur_start = t
    if cur_team is not None:
        segs.append({"t0": cur_start, "t1": records[-1].t, "team": cur_team})

    # Absorption des micro-segments dans le voisin (durée minimale au rendu).
    merged: list[dict] = []
    for seg in segs:
        if merged and (seg["t1"] - seg["t0"]) < min_seg:
            merged[-1]["t1"] = seg["t1"]  # on étale le précédent
            continue
        if merged and merged[-1]["team"] == seg["team"]:
            merged[-1]["t1"] = seg["t1"]
            continue
        merged.append(seg)

    return [
        {
            "t0": round(s["t0"], 1),
            "t1": round(s["t1"], 1),
            "team": "team1" if s["team"] == 0 else "team2",
        }
        for s in merged
    ]


# ─── Pression (distance au ballon) ─────────────────────────

def compute_pressure(
    records: list[FrameRecord],
    team_map: dict[int, int | None],
    model: TeamModel,
    median_player_h: float,
) -> dict:
    """Pression indicative : distance des joueurs au ballon.

    Sur les frames où le ballon est connu, pour chaque équipe :
      - avg_dist_m : distance moyenne de ses joueurs au ballon (plus BAS =
        l'équipe est plus souvent autour de la balle — pression / contrôle) ;
      - near_ball_avg : nombre moyen de joueurs dans le rayon de possession
        (joueurs « sur le ballon »).

    Neutre quand le ballon n'est pas détecté (aucune frame concernée).
    """
    m_per_px = _meters_per_px(median_player_h)
    radius_px = cfg.POSSESSION_RADIUS_FACTOR * max(1.0, median_player_h)

    dists: dict[int, list[float]] = defaultdict(list)
    near: dict[int, int] = defaultdict(int)
    n_ball_frames = 0

    for rec in records:
        if rec.ball is None:
            continue
        bx, by = rec.ball
        n_ball_frames += 1
        for tid, person in rec.persons.items():
            team = person_team(tid, person, team_map, model)
            if team is None:
                continue
            d = math.hypot(person.x - bx, person.y - by)
            dists[team].append(d)
            if d <= radius_px:
                near[team] += 1

    if n_ball_frames == 0:
        return {"team1": {"avg_dist_m": 0.0, "near_ball_avg": 0.0},
                "team2": {"avg_dist_m": 0.0, "near_ball_avg": 0.0}}

    def side(team: int) -> dict:
        d = dists.get(team, [])
        return {
            "avg_dist_m": round(float(np.mean(d)) * m_per_px, 1) if d else 0.0,
            "near_ball_avg": round(near.get(team, 0) / n_ball_frames, 1),
        }

    return {"team1": side(0), "team2": side(1)}
