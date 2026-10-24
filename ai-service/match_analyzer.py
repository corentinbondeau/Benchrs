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
import os
import time
from collections import defaultdict
from dataclasses import dataclass, field

import cv2
import numpy as np

import config as cfg
from vision import (
    Box,
    FrameObjects,
    Tracker,
    detect_ball2,
    get_ball_model,
    get_model,
    hsv_distance,
    median_torso_color,
)

# ─── Résultats intermédiaires ────────────────────────────────

@dataclass
class BallSample:
    """Échantillon de trajectoire du ballon."""

    idx: int
    t: float
    x: float
    y: float


@dataclass
class Person:
    """Un joueur détecté dans une frame : position + couleur de torse."""

    x: float
    y: float
    color: np.ndarray | None = None


@dataclass
class FrameRecord:
    """Snapshot par frame (positions des joueurs + du ballon)."""

    idx: int
    t: float
    ball: tuple[float, float] | None
    persons: dict[int, Person] = field(default_factory=dict)


@dataclass
class TeamModel:
    """Modèle de couleur des 2 équipes (2 centroïdes HSV + tolérance arbitre).

    `team_of(color)` classe une couleur de torse en équipe 0/1, ou None
    (arbitre / hors-match / couleur non fiable). Une seule source de vérité
    pour TOUS les calculs (possession, passes, équipe du tireur) : on évite
    ainsi qu'un même maillot soit classé différemment d'un calcul à l'autre —
    c'est ce qui faisait compter une passe pour la mauvaise équipe.
    """

    c0: np.ndarray
    c1: np.ndarray
    referee_tol: float
    ambiguous: bool
    hex_colors: list[str]

    def team_of(self, color: np.ndarray | None) -> int | None:
        if color is None:
            return None
        if self.ambiguous:
            return 0  # deux maillots inséparables : on n'invente pas d'opposition
        d0 = hsv_distance(color, self.c0)
        d1 = hsv_distance(color, self.c1)
        if min(d0, d1) > self.referee_tol or max(d0, d1) < 4.0:
            return None  # arbitre / personne hors-match
        return 0 if d0 <= d1 else 1


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
    track_counts: dict[int, int],
) -> tuple[dict[int, int | None], TeamModel]:
    """Assigne chaque track_id (joueur) à une équipe (0/1) ou à
    l'arbitre (None) via un k-means sur les couleurs de torse.

    Le modèle (2 centroïdes) est calibré sur les tracks VUS au moins
    `MIN_TRACK_SAMPLES_FOR_MODEL` fois : les tracks à 1-2 échantillons
    (faux positifs, fragments) polluaient le k-means et faisaient dériver les
    centroïdes — un maillot pouvait alors basculer d'une équipe à l'autre.
    Ces tracks rares sont quand même classés, mais contre un modèle propre.

    Retourne : (mapping track→équipe, TeamModel).
    """
    items = [(tid, c) for tid, c in track_colors.items() if c is not None]
    team_map: dict[int, int | None] = {tid: None for tid in track_colors}

    model_items = [
        (tid, c)
        for tid, c in items
        if track_counts.get(tid, 0) >= cfg.MIN_TRACK_SAMPLES_FOR_MODEL
    ]
    if len(model_items) < 2:
        model_items = items  # pas assez de tracks fiables : on utilise tout

    if len(model_items) < 2:
        # Trop peu de couleurs : tout en "équipe 0" (analyse non fiable)
        for tid in team_map:
            team_map[tid] = 0
        model = TeamModel(
            np.zeros(3), np.zeros(3), 0.0, True, ["#4f46e5", "#dc2626"]
        )
        return team_map, model

    colors = np.array([c for _, c in model_items], dtype=np.float32)
    crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 10, 1.0)
    _, _, centers = cv2.kmeans(
        colors, 2, None, crit, 5, cv2.KMEANS_PP_CENTERS
    )
    # L'ordre des centroïdes retournés par k-means dépend de l'init
    # aléatoire : sans canon, l'équipe 0 et l'équipe 1 s'échangent d'un
    # run à l'autre (les stats par équipe deviennent non comparables).
    # On ordonne par teinte HSV croissante — déterministe et cohérent.
    if centers[0][0] > centers[1][0]:
        centers = centers[::-1]
    c0, c1 = centers[0], centers[1]

    # Distance inter-centres : si les 2 équipes ont quasi la même
    # couleur, on bascule en "équipe inconnue" plutôt que de mentir.
    inter = hsv_distance(c0, c1)
    referee_tol = max(42.0, inter * 0.6)
    ambiguous = inter < 25.0

    model = TeamModel(
        c0, c1, referee_tol, ambiguous, [hsv_to_hex(c0), hsv_to_hex(c1)]
    )
    for tid, color in items:
        team_map[tid] = model.team_of(color)

    return team_map, model


def person_team(
    tid: int | None,
    person: Person,
    team_map: dict[int, int | None],
    model: TeamModel,
) -> int | None:
    """Équipe d'un joueur : d'abord celle de son TRACK (médiane robuste), sinon
    sa couleur propre. Le track est stable et débruité (médiane de dizaines
    d'échantillons) ; la couleur par frame sert de secours pour les tracks sans
    médiane (vus trop furtivement), qu'on perdait sinon entièrement.
    """
    team = team_map.get(tid) if tid is not None else None
    if team is None and not model.ambiguous and person.color is not None:
        team = model.team_of(person.color)
    return team


# ─── Possession ──────────────────────────────────────────────

def possession_radius(median_player_h: float) -> float:
    """Rayon d'une « touche » (contrôle du ballon), en px.

    Proportionnel à la hauteur apparente d'un joueur : identique en plan large
    et en plan serré. On retombe sur `POSSESSION_RADIUS` (valeur absolue) si la
    hauteur est inconnue/nulle.
    """
    if median_player_h and median_player_h > 0:
        return cfg.POSSESSION_RADIUS_FACTOR * median_player_h
    return cfg.POSSESSION_RADIUS


def possession_owners(
    records: list[FrameRecord],
    team_map: dict[int, int | None],
    model: TeamModel,
    fps: float,
    median_player_h: float,
) -> list[int | None]:
    """Séquence des équipes en possession, UNE entrée par frame.

    Règle : à chaque frame où le ballon est suivi, l'équipe du joueur le PLUS
    PROCHE du ballon est candidate au contrôle. On ne filtre PAS par un rayon :
    exiger une « touche » (joueur à moins de N px) rendait le résultat instable
    et dépendant d'un seuil (un ballon à 5 hauteurs d'un joueur basculait d'une
    équipe à l'autre) ; prendre toujours l'équipe la plus proche est décisif et
    reproductible. Un hystérésis (POSSESSION_HOLD frames) évite qu'un unique
    frame où l'ordre s'inverse ne fasse clignoter le possesseur.

    TOUS les moments comptent : quand aucun joueur n'est détecté (ballon hors
    cadre, masqué, ou détection joueurs momentanément vide), le DERNIER
    possesseur garde la possession (voir `POSSESSION_MAX_LOST_SEC`, 0 = illimité).

    Source unique de vérité pour `build_possession` ET le timeline de
    possession (`tactics_metrics.possession_segments`) : les deux ne peuvent
    pas diverger.
    """
    owners: list[int | None] = []
    owner: int | None = None
    pending: int | None = None
    pending_n = 0
    lost_limit = (
        int(cfg.POSSESSION_MAX_LOST_SEC * fps)
        if cfg.POSSESSION_MAX_LOST_SEC > 0
        else None
    )
    lost = 0
    seen_ball = False

    for rec in records:
        if rec.ball is not None:
            seen_ball = True
            lost = 0
            bx, by = rec.ball
            best: tuple[float, int] | None = None  # (dist, team)
            for tid, person in rec.persons.items():
                team = person_team(tid, person, team_map, model)
                if team is None:
                    continue
                d = math.hypot(person.x - bx, person.y - by)
                if best is None or d < best[0]:
                    best = (d, team)

            if best is not None:
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
            # Aucun joueur détecté : le dernier possesseur garde la balle.
        else:
            lost += 1
            if seen_ball and lost_limit is not None and lost > lost_limit:
                # Ballon « introuvable » trop longtemps : on cesse d'attribuer
                # (un ballon sorti du terrain ne doit pas compter indéfiniment).
                owner = None

        owners.append(owner)

    return owners


def build_possession(
    owners: list[int | None],
    fps: float,
) -> tuple[float, float, float]:
    """Possession (secondes + %) à partir de la séquence des possesseurs
    (`possession_owners`) — voir sa docstring pour la règle de calcul.

    Le temps « mesuré » = durée totale où une possession est attribuée
    (dénominateur du %).
    """
    frame_dt = 1.0 / fps if fps > 0 else 1.0 / 30.0
    t0 = sum(1 for o in owners if o == 0) * frame_dt
    t1 = sum(1 for o in owners if o == 1) * frame_dt

    total = t0 + t1
    pct0 = (t0 / total * 100.0) if total > 0 else 50.0
    pct1 = 100.0 - pct0
    return pct0, pct1, total


# ─── Passes ──────────────────────────────────────────────────

def count_passes(
    records: list[FrameRecord],
    team_map: dict[int, int | None],
    model: TeamModel,
    fps: float,
    median_player_h: float,
    frame_width: float | None = None,
) -> tuple[int, int]:
    """Compte les passes complétées.

    Méthode « vol de balle » : à chaque fois que le ballon QUITTE les
    joueurs (plus aucun joueur d'équipe connue dans le rayon de contrôle
    `PASS_CTRL_RADIUS_FACTOR × possession_radius`, plafonné à
    `PASS_CTRL_MAX_FRAME_FRACTION × largeur de frame`, confirmé
    `PASS_RELEASE_HOLD` frames), on mémorise l'équipe ET le track du joueur
    qui l'a relâché ; quand le ballon est de nouveau contrôlé (rayon
    identique, confirmé `PASS_HOLD` frames) par la MÊME équipe après avoir
    parcouru au moins `PASS_MIN_DIST_FACTOR × hauteur joueur`, c'est une
    passe complétée. Trois garde-fous :
    - un contrôle par l'équipe adverse n'est PAS une passe (interception) ;
    - le receveur doit être un **track différent** de l'expéditeur (un ballon
      qui rebondit sur le même joueur n'est pas une passe) ;
    - un vol qui dure plus de `PASS_MAX_FLIGHT_SEC` s'annule (le ballon est
      sorti du cadre / perdu — un récontrôle des secondes plus tard n'est
      pas la même action).
    Le rayon strict `PASS_RADIUS_FACTOR × possession_radius` sert
    d'hystérésis au lâcher (un ballon encore proche d'un joueur n'est pas
    « quitté »).

    Les personnes d'équipe inconnue (arbitre, mauvaise classification) sont
    ignorées : elles ne déclenchent ni vol ni passe, et ne réinitialisent
    pas le contrôleur (une fois, l'arbitre proche du ballon annulait toutes
    les passes de l'équipe qui le jouait).
    """
    base_r = possession_radius(median_player_h)
    ctrl_r = cfg.PASS_CTRL_RADIUS_FACTOR * base_r
    if frame_width and frame_width > 0:
        ctrl_r = min(ctrl_r, cfg.PASS_CTRL_MAX_FRAME_FRACTION * frame_width)
    rel_r = cfg.PASS_RADIUS_FACTOR * base_r
    min_travel = cfg.PASS_MIN_DIST_FACTOR * median_player_h
    release_hold = max(1, cfg.PASS_RELEASE_HOLD)
    hold = max(1, cfg.PASS_HOLD)
    max_flight = cfg.PASS_MAX_FLIGHT_SEC  # secondes de temps mur

    controller: int | None = None      # équipe en contrôle confirmé
    controller_tid: int | None = None  # track du joueur en contrôle
    flying = False
    release_pos: tuple[float, float] | None = None
    release_tid: int | None = None
    release_t: float | None = None     # temps mur du lâcher (timeout réel)
    last_ball: tuple[float, float] | None = None
    last_tid: int | None = None
    out_n = 0
    hold_team: int | None = None
    hold_tid: int | None = None
    hold_n = 0
    passes: dict[int, int] = defaultdict(int)

    for rec in records:
        if rec.ball is None:
            continue
        bx, by = rec.ball

        if flying and release_t is not None:
            if rec.t - release_t > max_flight:
                flying = False  # vol expiré : ce n'est plus la même action
                release_pos = None
                release_tid = None
                release_t = None

        best: tuple[float, int, int] | None = None  # (dist, team, tid)
        for tid, person in rec.persons.items():
            team = person_team(tid, person, team_map, model)
            if team is None:
                continue
            d = math.hypot(person.x - bx, person.y - by)
            if best is None or d < best[0]:
                best = (d, team, tid)

        near = best is not None and best[0] <= ctrl_r

        if near:
            _, team, tid = best
            if team == hold_team and tid == hold_tid:
                hold_n += 1
            else:
                hold_team, hold_tid, hold_n = team, tid, 1
            if hold_n == hold:
                # (Re)contrôle confirmé.
                if flying:
                    travel = (
                        math.hypot(bx - release_pos[0], by - release_pos[1])
                        if release_pos
                        else 0.0
                    )
                    if (
                        team == controller
                        and travel >= min_travel
                        and tid != release_tid
                    ):
                        passes[team] += 1
                    flying = False
                    release_pos = None
                    release_tid = None
                    release_t = None
                controller = team
                controller_tid = tid
                out_n = 0
            if not flying:
                last_ball = (bx, by)
                last_tid = tid
        else:
            hold_team = None
            hold_tid = None
            hold_n = 0
            if controller is not None:
                # Hystérésis : le ballon n'est « quitté » que s'il dépasse
                # aussi le rayon strict (ignoré quand ctrl_r >= rel_r).
                left = best is None or best[0] > rel_r
                if left:
                    out_n += 1
                    if not flying and out_n >= release_hold:
                        flying = True
                        release_pos = last_ball if last_ball is not None else (bx, by)
                        release_tid = last_tid
                        release_t = rec.t
                else:
                    out_n = 0

    return passes.get(0, 0), passes.get(1, 0)


# ─── Tirs ────────────────────────────────────────────────────

def possessor_team_at(
    frame_records: list[FrameRecord],
    team_map: dict[int, int | None],
    model: TeamModel,
    upto_idx: int,
    median_player_h: float,
) -> int | None:
    """Équipe du possesseur du ballon jusqu'à la frame `upto_idx` (inclus).

    On parcourt les frames dans l'ordre et on retient la dernière où un joueur
    d'équipe connue est à portée du ballon (rayon = `possession_radius`).
    Renvoie None si aucune équipe n'est identifiée (le caller décide du repli).
    """
    team: int | None = None
    for rec in frame_records:
        if rec.idx > upto_idx:
            break
        if rec.ball is None:
            continue
        bx, by = rec.ball
        best: tuple[float, int] | None = None
        for tid, person in rec.persons.items():
            team_t = person_team(tid, person, team_map, model)
            if team_t is None:
                continue
            dd = math.hypot(person.x - bx, person.y - by)
            if best is None or dd < best[0]:
                best = (dd, team_t)
        if best is not None and best[0] <= possession_radius(median_player_h):
            team = best[1]
    return team


def detect_shots(
    ball_samples: list[BallSample],
    frame_records: list[FrameRecord],
    team_map: dict[int, int | None],
    model: TeamModel,
    frame_w: int,
    median_player_h: float,
    fps: float,
    step_scale: float = 1.0,
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

    `step_scale` = nombre de frames NATIVES entre deux frames analysées
    (stride). Le budget d'analyse échantillonne la vidéo : entre deux frames
    analysées le ballon parcourt `step_scale`× plus loin, donc les seuils
    « par frame » (distance et vitesse normalisées) sont multipliés d'autant
    pour conserver le même seuil PHYSIQUE qu'en analyse frame-à-frame.
    """
    if median_player_h <= 0 or len(ball_samples) < 8:
        return []

    all_px = [p.x for rec in frame_records for p in rec.persons.values()]
    all_py = [p.y for rec in frame_records for p in rec.persons.values()]
    if not all_px:
        return []

    pitch_min_x = float(np.percentile(all_px, 1.0))
    pitch_max_x = float(np.percentile(all_px, 99.0))
    goal_center_y = float(np.median(all_py))
    goal_opening = median_player_h * cfg.GOAL_OPENING_FACTOR

    # Déplacements du ballon entre frames CONSÉCUTIVES uniquement. Une
    # ré-acquisition après un trou (le ballon peut réapparaître ailleurs) est
    # un saut de position, pas une vitesse : le test de contiguïté
    # `b.idx - a.idx == 1` l'écarte déjà. On borne en plus le saut à
    # `SHOT_MAX_STEP_FACTOR × hauteur joueur` pour ignorer un faux positif
    # franc (ballon détecté ailleurs sur UNE seule frame, ex. la tête d'un
    # joueur) sans rejeter un vrai tir (qui dépasse la hauteur d'un joueur
    # par frame en plan serré).
    # `step_scale` (stride) : entre deux frames analysées, le ballon parcourt
    # `step_scale`× plus loin → on multiplie le saut max plausible pour ne pas
    # rejeter un vrai tir sous-échantillonné.
    max_plausible = cfg.SHOT_MAX_STEP_FACTOR * median_player_h * step_scale
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
        # Vitesse normalisée par la taille d'un joueur (seuil × step_scale :
        # cf. en-tête — la distance est mesurée sur `step_scale` frames natives).
        if step_len / median_player_h < cfg.SHOT_SPEED_RATIO * step_scale:
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

        # Un tir est pris PRÈS du but attaqué. Les « buts » sont estimés aux
        # bords de l'image (faute de calibration) : sans ce garde-fou, tout
        # ballon rapide filant vers un bord — donc toute passe en profondeur ou
        # dégagement vers l'avant — était compté comme tir. On exige que le
        # ballon soit, au moment de la frappe, dans la zone du but visé.
        if abs(s.x - goal_x) > cfg.SHOT_GOAL_ZONE_FRACTION * (pitch_max_x - pitch_min_x):
            continue

        t_hit = (goal_x - s.x) / vel_x
        if t_hit <= 0 or t_hit > 4 * fps:
            continue  # ne finit pas sur un but sous l'horizon

        y_hit = s.y + vel_y * t_hit
        on_target = abs(y_hit - goal_center_y) <= goal_opening / 2

        # (a) Projection hors amplitude verticale (y) du terrain : le ballon
        # projeté finit bien au-delà de la bande de jeu couverte par les
        # joueurs → la « frappe » part vers la touche, pas vers le but.
        y_amp = max(all_py) - min(all_py)
        if y_amp > 0 and abs(y_hit - goal_center_y) > cfg.SHOT_Y_MARGIN_FACTOR * y_amp:
            if os.environ.get("SHOTS_DEBUG") == "1":
                print(f"[shot?] t={s.t:.1f} REJET y_hit hors terrain "
                      f"y_hit={y_hit:.0f} centre={goal_center_y:.0f} amp={y_amp:.0f}",
                      flush=True)
            continue

        # (b) Atteinte (ou frôlement) du fond PUIS retour profond en jeu dans
        # les secondes suivant la frappe : c'est un échange/dégagement qui
        # finit près du fond, pas un tir isolé (un vrai tir sort et reste
        # dehors, ou reste au filet). La zone « fond » est élargie à
        # SHOT_NEAR_ZONE_FACTOR × reach : un dégagement s'arrête souvent à
        # ~80 px du bord estimé sans vraiment entrer dans le reach strict —
        # il faut quand même capter son retour en jeu.
        reach_w = cfg.GOAL_REACH_FRACTION * (pitch_max_x - pitch_min_x)
        look = int(cfg.GOAL_RETURN_GUARD_SEC * fps)
        if vel_x < 0:
            near_line = pitch_min_x + cfg.SHOT_NEAR_ZONE_FACTOR * reach_w
            back_line = pitch_min_x + cfg.SHOT_RETURN_MARGIN_FACTOR * reach_w
        else:
            near_line = pitch_max_x - cfg.SHOT_NEAR_ZONE_FACTOR * reach_w
            back_line = pitch_max_x - cfg.SHOT_RETURN_MARGIN_FACTOR * reach_w
        reached_fond = False
        returned = False
        for o in order:
            if o.idx <= a.idx:
                continue
            if o.idx > a.idx + look:
                break
            if (o.x <= near_line) if vel_x < 0 else (o.x >= near_line):
                reached_fond = True
            elif reached_fond and ((o.x > back_line) if vel_x < 0 else (o.x < back_line)):
                returned = True
                break
        if returned:
            if os.environ.get("SHOTS_DEBUG") == "1":
                print(f"[shot?] t={s.t:.1f} REJET retour en jeu après fond "
                      f"(zone={near_line:.0f} back_line={back_line:.0f} dans {look} frames)",
                      flush=True)
            continue

        # Équipe qui tire : le possesseur du moment
        team = possessor_team_at(
            frame_records, team_map, model, s.idx, median_player_h
        )
        team = team if team is not None else (0 if vel_x > 0 else 1)

        # But probable : le ballon a dépassé franchement la ligne de but…
        # …mais s'il revient profondément en jeu dans les secondes qui
        # suivent, le « dépassement » était un dégagement qui frôle/croise la
        # ligne estimée (bord de l'image), pas un but : on garde le tir.
        beyond = sample_from(s.idx + int(t_hit))
        is_goal = False
        if beyond and (beyond.x < pitch_min_x - 5 or beyond.x > pitch_max_x + 5):
            reach = cfg.GOAL_REACH_FRACTION * (pitch_max_x - pitch_min_x)
            look = int(cfg.GOAL_RETURN_GUARD_SEC * fps)
            if beyond.x < pitch_min_x - 5:
                back_line = pitch_min_x + cfg.GOAL_RETURN_MARGIN_FACTOR * reach
                returned = any(
                    beyond.idx < o.idx <= beyond.idx + look and o.x > back_line
                    for o in order
                )
            else:
                back_line = pitch_max_x - cfg.GOAL_RETURN_MARGIN_FACTOR * reach
                returned = any(
                    beyond.idx < o.idx <= beyond.idx + look and o.x < back_line
                    for o in order
                )
            is_goal = not returned

        event_type = "goal" if is_goal else "shot"
        side = "gauche" if vel_x < 0 else "droite"
        if os.environ.get("SHOTS_DEBUG") == "1":
            after = [o for o in order if a.idx <= o.idx <= a.idx + int(3 * fps)]
            print(
                f"[SHOT t={s.t:.1f}] {event_type} {side} cadré={on_target} "
                f"hit=({s.x:.0f},{s.y:.0f}) vel=({vel_x:.1f},{vel_y:.1f}) "
                f"step={step_len:.0f} mom={projected:.0f}/{momentum_factor * step_len:.0f} "
                f"t_hit={t_hit:.0f} y_hit={y_hit:.0f}",
                flush=True,
            )
            print(
                f"  ±3s x={[round(o.x) for o in after[:18]]}"
                f"{'…' if len(after) > 18 else ''} y={[round(o.y) for o in after[:18]]}",
                flush=True,
            )
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


def detect_goals(
    ball_samples: list[BallSample],
    frame_records: list[FrameRecord],
    team_map: dict[int, int | None],
    model: TeamModel,
    frame_w: int,
    median_player_h: float,
    fps: float,
    step_scale: float = 1.0,
) -> list[dict]:
    """Détection des BUTS par l'ARRIVÉE du ballon au fond.

    Complémentaire de `detect_shots` : le « tir » exige une frappe rapide
    repérée dans la zone du but, ce qui RATE un but dont la frappe n'est pas
    vue (ballon masqué, tête, ballon déjà dans la surface, détection perdue au
    moment crucial). Ici on regarde directement où le ballon FINIT : s'il
    atteint l'extrémité du terrain (le but, estimé aux bords de la répartition
    des joueurs) à vitesse suffisante et dans l'ouverture du but, c'est un but.

    On mesure la vitesse d'arrivée sur `GOAL_ARRIVAL_WINDOW` frames analysées et
    on exige qu'elle pointe vers l'extrémité atteinte. Le seuil de vitesse et
    la distance de saut sont normalisés par la hauteur d'un joueur et par
    `step_scale` (échantillonnage temporel) pour rester physiquement constants.
    """
    if median_player_h <= 0 or len(ball_samples) < 8:
        return []

    all_px = [p.x for rec in frame_records for p in rec.persons.values()]
    all_py = [p.y for rec in frame_records for p in rec.persons.values()]
    if not all_px:
        return []

    pitch_min_x = float(np.percentile(all_px, 1.0))
    pitch_max_x = float(np.percentile(all_px, 99.0))
    goal_center_y = float(np.median(all_py))
    goal_opening = median_player_h * cfg.GOAL_OPENING_FACTOR
    width = pitch_max_x - pitch_min_x
    if width <= 0:
        return []

    reach = cfg.GOAL_REACH_FRACTION * width
    min_speed = cfg.GOAL_ARRIVAL_MIN_SPEED_FACTOR * median_player_h * step_scale
    window = max(2, cfg.GOAL_ARRIVAL_WINDOW)
    cooldown = int(1.5 * fps)

    order = sorted(ball_samples, key=lambda s: s.idx)
    if len(order) <= window:
        return []

    goals: list[dict] = []
    last_goal_frame = -10**6
    debug = os.environ.get("GOALS_DEBUG") == "1"
    for i in range(window, len(order)):
        cur = order[i]
        if cur.idx - last_goal_frame < cooldown:
            continue
        prev = order[i - window]
        span = cur.idx - prev.idx
        if span <= 0:
            continue
        vx = (cur.x - prev.x) / span
        vy = (cur.y - prev.y) / span
        speed = math.hypot(vx, vy)
        if speed < min_speed:
            if debug:
                print(f"[goal?] t={cur.t:.1f} REJET vitesse {speed:.1f}<{min_speed:.1f} "
                      f"span={span} pos=({cur.x:.0f},{cur.y:.0f})", flush=True)
            continue
        # Cohérence par PAS : un déplacement inter-échantillons au-delà du
        # plausible physique = téléportation de détection (ballon perdu puis
        # relocalisé à l'autre bout du terrain), pas une vraie trajectoire.
        win = order[max(0, i - window): i + 1]
        step_plaus = cfg.GOAL_MAX_STEP_FACTOR * median_player_h * step_scale
        worst_step = 0.0
        for k in range(len(win) - 1):
            gap = win[k + 1].idx - win[k].idx
            if gap <= 0:
                continue
            # Distance EUCLIDIENNE (x ET y) : une teleportation peut être
            # purement verticale (Δx≈0, Δy=350 px) — ne mesurer que Δx
            # la laissait passer.
            worst_step = max(
                worst_step,
                math.hypot(win[k + 1].x - win[k].x, win[k + 1].y - win[k].y) / gap,
            )
        if worst_step > step_plaus:
            if debug:
                print(f"[goal?] t={cur.t:.1f} REJET pas incohérent "
                      f"{worst_step:.0f}>{step_plaus:.0f} xs={[round(s.x) for s in win]}",
                      flush=True)
            continue
        # Doit arriver DANS l'ouverture du but (bande verticale).
        if abs(cur.y - goal_center_y) > goal_opening / 2:
            if debug:
                print(f"[goal?] t={cur.t:.1f} REJET y hors ouverture "
                      f"y={cur.y:.0f} centre={goal_center_y:.0f}", flush=True)
            continue
        if vx < 0 and cur.x <= pitch_min_x + reach:
            side, entry = "gauche", "entré"
        elif vx > 0 and cur.x >= pitch_max_x - reach:
            side, entry = "droite", "entré"
        else:
            if debug:
                print(f"[goal?] t={cur.t:.1f} REJET pas au fond "
                      f"x={cur.x:.0f} (min={pitch_min_x:.0f} max={pitch_max_x:.0f} "
                      f"reach={reach:.0f}) vx={vx:.1f}", flush=True)
            continue
        # Garde-fou retour : si le ballon réapparaît profondément en jeu dans
        # les secondes qui suivent, l'arrivée au fond était un dégagement qui
        # frôle la ligne, pas un but (un vrai but reste au filet/disparaît).
        look = int(cfg.GOAL_RETURN_GUARD_SEC * fps)
        if side == "gauche":
            back_line = pitch_min_x + cfg.GOAL_RETURN_MARGIN_FACTOR * reach
            back = next(
                (s for s in order
                 if cur.idx < s.idx <= cur.idx + look and s.x > back_line),
                None,
            )
        else:
            back_line = pitch_max_x - cfg.GOAL_RETURN_MARGIN_FACTOR * reach
            back = next(
                (s for s in order
                 if cur.idx < s.idx <= cur.idx + look and s.x < back_line),
                None,
            )
        if back is not None:
            if debug:
                print(f"[goal?] t={cur.t:.1f} REJET retour en jeu "
                      f"(x={back.x:.0f} au-delà de {back_line:.0f} à t={back.t:.1f})",
                      flush=True)
            continue

        if debug:
            print(f"[GOAL-ACCEPT] t={cur.t:.1f} cote={side} v={speed:.1f} "
                  f"span={span} min_speed={min_speed:.1f} "
                  f"ys={[round(s.y) for s in win]} xs={[round(s.x) for s in win]}",
                  flush=True)

        team = possessor_team_at(frame_records, team_map, model, cur.idx, median_player_h)
        team = team if team is not None else (0 if vx > 0 else 1)
        goals.append(
            {
                "t": round(cur.t, 1),
                "type": "goal",
                "team": f"team{team + 1}",
                "on_target": True,
                "note": f"Ballon {entry} au fond côté {side}",
            }
        )
        last_goal_frame = cur.idx

    return goals


# ─── Suivi de la trajectoire du ballon ───────────────────────

def select_ball_track(
    candidates: list[list[tuple[float, float, float]]],
    max_jump: float,
    fps: float,
    reacquire_frames: int | None = None,
    hard_restart_frames: int | None = None,
    max_speed: float | None = None,
) -> list[BallSample]:
    """Sélectionne UNE trajectoire de ballon cohérente frame à frame.

    Le détecteur sort beaucoup de faux positifs isolés ; prendre à chaque
    frame la détection la plus confiante produit une trajectoire qui saute
    de 900 px et fausse tous les calculs (possessions, tirs). Ici on suit
    la détection la plus proche de la position PRÉDITE (position + vitesse),
    en rejetant les sauts > `max_jump`. Après `reacquire_frames` frames
    sans ballon, on tente une ré-acquisition PLAUSIBLE ; au-delà de
    `hard_restart_frames`, la piste est considérée perdue et on repart à
    zéro (trou honnête, pas une teleportation).

    Trois règles évitent les « tracks polluées » (sauts de 500+ px entre
    échantillons consécutifs) :

    1. **La vitesse est par FRAME** : `vx = (chosen − prev) / step` où
       `step` = nombre de frames écoulées depuis le dernier échantillon
       accepté (trous compris). La prédiction est extrapolée sur `step`
       frames (`prev + v × step`). Sans cette division, un trou de 5 frames
       produisait une vitesse 5× trop grande, la prédiction partait à la
       dérive, toutes les détections devenaient « trop loin » → cascade de
       rejets → ré-acquisitions en série.
    2. **La ré-acquisition est souple et PLAUSIBLE** : on ne reprend que la
       détection la plus confiante parmi celles à distance ≤ `max_jump +
       max_speed × step` de la prédiction (le ballon a pu aller vite pendant
       le trou, pas traverser le terrain en 0,4 s). Aucune détection
       plausible → on continue d'attendre.
    3. **La ré-acquisition ne reprend PAS la vitesse** quand la détection
       reprise est hors de portée (début de piste fraîche) : le déplacement
       n'a aucun sens physique — en faire la nouvelle vitesse empoisonnait
       la prédiction et créait des teleportations en chaîne.
    """
    if reacquire_frames is None:
        reacquire_frames = cfg.BALL_REACQUIRE_FRAMES
    if hard_restart_frames is None:
        hard_restart_frames = reacquire_frames * 4
    if max_speed is None:
        # ≈ 0.5 × hauteur joueur × stride (par frame analysée) : ~1× la
        # vitesse d'une frappe rapide — au-delà, c'est une teleportation
        # de détection, pas un déplacement de ballon.
        max_speed = 0.5 * max_jump / cfg.BALL_MAX_JUMP_FACTOR
    samples: list[BallSample] = []
    prev: tuple[float, float] | None = None
    vx = vy = 0.0
    gap = 0

    for idx, dets in enumerate(candidates):
        if not dets:
            gap += 1
            if prev is not None and gap >= hard_restart_frames:
                prev = None  # piste perdue : trou honnête, repartir à zéro
            continue

        if prev is None:
            chosen = max(dets, key=lambda d: d[2])
        else:
            step = gap + 1
            px = prev[0] + vx * step
            py = prev[1] + vy * step
            chosen = min(dets, key=lambda d: math.hypot(d[0] - px, d[1] - py))
            if math.hypot(chosen[0] - px, chosen[1] - py) > max_jump:
                gap += 1
                if gap < reacquire_frames:
                    if gap >= hard_restart_frames:
                        prev = None
                    continue
                # Ré-acquisition souple : parmi les détections encore
                # physiquement plausibles, la plus confiante. Sinon attendre
                # (ou restart si le trou est déjà très long). La vitesse
                # implicite reste bornée par `radius / step` → pas de
                # teleportation empoisonnante.
                radius = max_jump + max_speed * step
                plausible = [
                    d for d in dets
                    if math.hypot(d[0] - px, d[1] - py) <= radius
                ]
                if not plausible:
                    if gap >= hard_restart_frames:
                        prev = None
                    continue
                chosen = max(plausible, key=lambda d: d[2])

        if prev is not None:
            step = gap + 1
            vx = (chosen[0] - prev[0]) / step
            vy = (chosen[1] - prev[1]) / step
        prev = (chosen[0], chosen[1])
        gap = 0
        samples.append(BallSample(idx=idx, t=idx / fps, x=chosen[0], y=chosen[1]))

    return samples


def interpolate_ball_track(
    samples: list[BallSample],
    fps: float,
    max_gap_frames: int,
) -> list[BallSample]:
    """Comble les trous COURTS de la trajectoire du ballon.

    Le détecteur rate le ballon sur une bonne partie des frames (petit objet
    rapide) : sans comblement, la possession n'était mesurée que sur les
    quelques frames de détection (~4 s sur une vidéo de 2 min), ce qui rendait
    le pourcentage inexploitable. On interpole linéairement entre deux
    détections successives séparées d'au plus `max_gap_frames` frames. Au-delà,
    on ne comble pas (on ne sait pas où est le ballon).

    À n'utiliser QUE pour la possession/passes : l'interpolation crée une ligne
    droite, ce qui pourrait inventer un « tir » — la détection des tirs
    travaille donc sur les échantillons RÉELS (`select_ball_track`).
    """
    if len(samples) < 2:
        return samples
    dt = 1.0 / fps if fps > 0 else 1.0 / 30.0
    out: list[BallSample] = [samples[0]]
    for a, b in zip(samples, samples[1:]):
        gap = b.idx - a.idx
        if 1 < gap <= max_gap_frames + 1:
            for k in range(1, gap):
                frac = k / gap
                i = a.idx + k
                out.append(
                    BallSample(
                        idx=i,
                        t=i * dt,
                        x=a.x + (b.x - a.x) * frac,
                        y=a.y + (b.y - a.y) * frac,
                    )
                )
        out.append(b)
    return out


def merge_ball_candidates(
    coco: list[list[tuple[float, float, float]]],
    ball2: list[list[tuple[float, float, float]]] | None,
    median_player_h: float,
) -> list[list[tuple[float, float, float]]]:
    """Fusionne les candidats ballon COCO et du 2e modèle (union), en
    dédoublonnant par proximité (rayon = BALL_MERGE_RADIUS_FACTOR x
    hauteur joueur, plancher 0.5 px). Retourne les candidats COCO si
    `ball2` est vide/non fourni (pipeline mono-modèle inchangé)."""
    if not ball2:
        return [[(x, y, c) for x, y, c in d] for d in coco]
    merge_r = cfg.BALL_MERGE_RADIUS_FACTOR * median_player_h
    if merge_r < 0.5:
        merge_r = 0.5
    out: list[list[tuple[float, float, float]]] = []
    for c, b in zip(coco, ball2):
        cands = [(x, y, c) for x, y, c in c]
        for bx, by, bc in b:
            dup = False
            for j, (cx, cy, cc) in enumerate(cands):
                if math.hypot(bx - cx, by - cy) <= merge_r:
                    dup = True
                    if bc > cc:
                        cands[j] = (bx, by, bc)
                    break
            if not dup:
                cands.append((bx, by, bc))
        out.append(cands)
    return out


# ─── Budget d'analyse : estimation du coût/frame ─────────────

def estimate_sec_per_frame(
    video_path: str,
    scale: float,
    frame_w: int,
    frame_h: int,
    native_total: int,
) -> float:
    """Estime le temps de calcul d'UNE frame analysée (secondes).

    On mesure l'inférence réelle (même modèle, résolution, TTA, device) sur
    `CALIB_FRAMES` frames RÉPARTIES sur toute la vidéo (et non seulement au
    début) : le coût varie avec le nombre d'objets détectés, et on veut capter
    les séquences chargées. On prend un percentile HAUT (p80) plutôt que la
    médiane, car le risque est de SOUS-estimer (budget dépassé) et non l'inverse.
    La marge de throttle est appliquée par l'appelant (ANALYSIS_SAFETY_FACTOR).
    Renvoie 0.0 si l'estimation échoue (→ pas d'échantillonnage).
    """
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return 0.0
    try:
        cap.set(cv2.CAP_PROP_ORIENTATION_AUTO, 1)
    except Exception:
        pass

    model = get_model()
    # Si le 2e modèle ballon est configuré, il tourne sur CHAQUE frame
    # analysée : son coût doit entrer dans la calibration (sinon le budget
    # est sous-estimé et le stride choisi ne tiendra pas).
    use_ball2 = bool(cfg.BALL_MODEL_PATH)
    times: list[float] = []

    def measure(frame: np.ndarray) -> None:
        if scale < 1.0:
            frame = cv2.resize(
                frame, (max(1, int(frame_w * scale)), max(1, int(frame_h * scale)))
            )
        t0 = time.perf_counter()
        model.predict(
            source=frame,
            conf=cfg.DETECT_CONFIDENCE,
            imgsz=cfg.IMGSZ,
            augment=cfg.AUGMENT,
            verbose=False,
            device=cfg.torch_device(),
        )
        if use_ball2:
            detect_ball2(frame)
        times.append(time.perf_counter() - t0)

    # Warmup (chargement du modèle) puis 1re mesure ignorée.
    first = cap.read()[1]
    if first is None:
        cap.release()
        return 0.0
    measure(first)
    times.clear()

    n = max(1, cfg.CALIB_FRAMES)
    for k in range(1, n + 1):
        pos = int(native_total * k / (n + 1)) if native_total > 0 else 0
        try:
            cap.set(cv2.CAP_PROP_POS_FRAMES, pos)
        except Exception:
            pass
        ok, frame = cap.read()
        if not ok or frame is None:
            continue
        measure(frame)

    cap.release()
    if not times:
        return 0.0
    return float(np.percentile(times, 80))


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
    native_total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 0
    total = native_total if native_total > 0 else cfg.MAX_FRAMES

    # Garde-fous anti-DoS : résolution d'analyse plafonnée (downscale),
    # temps de calcul borné (HARD_TIMEOUT_SEC), frames bornées.
    scale = min(
        1.0,
        cfg.MAX_VIDEO_WIDTH / frame_w if frame_w else 1.0,
        cfg.MAX_VIDEO_HEIGHT / frame_h if frame_h else 1.0,
    )
    do_scale = scale < 1.0
    hard_deadline = time.monotonic() + cfg.HARD_TIMEOUT_SEC

    # ── Budget d'analyse → échantillonnage temporel (stride) ──
    # La détection tourne à qualité MAXIMALE (résolution 1600 + TTA). Pour tenir
    # dans ANALYSIS_MAX_SEC sur une vidéo longue, on analyse une frame sur
    # `stride` (au lieu de dégrader la qualité de CHAQUE frame) : on mesure le
    # coût réel d'une frame puis on choisit le plus petit stride qui tient le
    # budget. `fps_eff` = fps d'analyse ; toutes les mesures « par frame »
    # (vitesses, sauts) sont normalisées par ce fps et par `stride`.
    stride = 1
    sec_per_frame = 0.0
    if cfg.ANALYSIS_MAX_SEC > 0 and native_total > 0:
        sec_per_frame = estimate_sec_per_frame(
            video_path, scale, frame_w, frame_h, native_total
        )
        sec_per_frame *= cfg.ANALYSIS_SAFETY_FACTOR
        if sec_per_frame > 0:
            budget_frames = int(cfg.ANALYSIS_MAX_SEC / sec_per_frame)
            if budget_frames < 1:
                budget_frames = 1
            stride = max(1, math.ceil(native_total / budget_frames))
    fps_eff = fps / stride

    tracker = Tracker()
    records: list[FrameRecord] = []
    ball_candidates: list[list[tuple[float, float, float]]] = []
    ball2_candidates: list[list[tuple[float, float, float]]] = []
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

    idx = 0          # index de frame ANALYSÉE (0,1,2…), utilisé partout en aval
    native_idx = 0   # index de frame NATIVE (progression + échantillonnage)
    untracked_seq = 0  # clés distinctes pour les détections sans track_id
    timed_out = False

    def report(force: bool = False) -> None:
        # Progression sur la position NATIVE (le décodage avance même quand on
        # saute la détection d'une frame).
        if progress_cb and (native_idx % 20 == 0 or force) and total:
            progress_cb(int(min(100.0, native_idx / total * 100.0)))

    while True:
        ok, frame = cap.read()
        if not ok or native_idx >= cfg.MAX_FRAMES:
            break
        if time.monotonic() > hard_deadline:
            # Filet de sécurité (l'estimation a été trop optimiste) : on
            # s'arrête proprement sur ce qui a été analysé au lieu de faire
            # échouer le job. Le budget pré-calibré est censé l'éviter.
            timed_out = True
            break

        # Échantillonnage temporel : on décode toutes les frames (coût faible)
        # mais on n'analyse qu'une frame sur `stride`.
        if native_idx % stride != 0:
            native_idx += 1
            report()
            continue

        if do_scale:
            frame = cv2.resize(
                frame, (max(1, int(frame_w * scale)), max(1, int(frame_h * scale)))
            )

        objects: FrameObjects = tracker.update(frame, idx)
        t = idx / fps_eff
        record = FrameRecord(idx=idx, t=t, ball=None)
        for b in objects.persons:
            # Couleur de torse de CETTE détection : elle sert de secours quand
            # le track n'a pas (encore) de couleur médiane fiable.
            col = median_torso_color(frame, b)
            if b.track_id is not None:
                tid = b.track_id
            else:
                # Sans track_id, toutes les détections partageraient la clé None
                # et se recouvriraient : on donne à chacune une clé unique.
                untracked_seq += 1
                tid = -untracked_seq
            record.persons[tid] = Person(b.cx, b.cy, col)
            height = b.height
            if height > 10:  # ignore minuscules faux positifs
                median_heights.append(float(height))
            if b.track_id is not None and col is not None:
                bucket = track_colors[b.track_id]
                if len(bucket) < max_color_samples:
                    bucket.append(col)
        if objects.balls:
            ball_candidates.append(
                [(b.cx, b.cy, b.confidence) for b in objects.balls]
            )
        else:
            ball_candidates.append([])
        # 2e détecteur ballon (optionnel, BALL_MODEL_PATH) : mêmes frames
        # que COCO ; renvoie [] instantanément si non configuré.
        ball2_candidates.append(detect_ball2(frame))

        records.append(record)
        idx += 1
        native_idx += 1
        report()

    cap.release()
    report(force=True)

    if idx == 0:
        raise RuntimeError("La vidéo est vide ou corrompue")

    # Couleur médiane par joueur (robuste aux mouvements)
    avg_colors: dict[int, np.ndarray] = {
        tid: np.median(vals, axis=0) for tid, vals in track_colors.items() if vals
    }
    track_counts = {tid: len(vals) for tid, vals in track_colors.items()}
    team_map, team_model = classify_teams(avg_colors, track_counts)

    median_player_h = (
        float(np.median(median_heights)) if median_heights else 40.0
    )

    # Trajectoire du ballon filtrée (rejette les faux positifs isolés) puis
    # réinjectée dans les enregistrements pour possession/passes. On comble
    # les trous courts (interpolation) pour que la possession couvre une vraie
    # fraction de la vidéo ; les tirs, eux, utilisent les échantillons RÉELS.
    # Tout est exprimé en frames ANALYSÉES (fps_eff) ; le saut/la vitesse « par
    # frame » est multiplié par `stride` pour rester à seuil physique constant.
    ball_max_jump = cfg.BALL_MAX_JUMP_FACTOR * median_player_h * stride
    reacquire = max(1, cfg.BALL_REACQUIRE_FRAMES // stride)
    interp_gap = max(1, cfg.BALL_INTERP_MAX_GAP // stride)
    # Union COCO ∪ modèle ballon dédié (si configuré) : les deux capteurs sont
    # complémentaires (chacun manque ~10-30 % de frames que l'autre couvre),
    # avec un accord ~90 % sur les frames communes. Sans BALL_MODEL_PATH,
    # ball2_candidates est vide → les candidats COCO sont retournés tels quels.
    merged_candidates = merge_ball_candidates(
        ball_candidates, ball2_candidates, median_player_h
    )
    ball_samples = select_ball_track(
        merged_candidates, ball_max_jump, fps_eff, reacquire_frames=reacquire
    )
    ball_track = interpolate_ball_track(ball_samples, fps_eff, interp_gap)
    for s in ball_track:
        if 0 <= s.idx < len(records):
            records[s.idx].ball = (s.x, s.y)

    # Import différé : tactics_metrics importe les dataclasses de ce module
    # (FrameRecord, person_team…) — un import en tête de fichier serait un
    # import circulaire.
    from tactics_metrics import (
        compute_physical,
        compute_pressure,
        compute_structure,
        possession_segments,
    )

    owners = possession_owners(records, team_map, team_model, fps_eff, median_player_h)
    pct0, pct1, meas_sec = build_possession(owners, fps_eff)
    pass0, pass1 = count_passes(
        records, team_map, team_model, fps_eff, median_player_h, frame_w
    )

    # Métriques physiques / structure / pression : dérivées des tracks de
    # joueurs (signal robuste), pas de la détection du ballon. Calibration
    # px → m approximative (voir tactics_metrics) — valeurs relatives.
    physical = compute_physical(records, team_map, team_model, median_player_h)
    structure = compute_structure(records, team_map, team_model, median_player_h)
    pressure = compute_pressure(records, team_map, team_model, median_player_h)
    possession_timeline = possession_segments(owners, records)

    shots = detect_shots(
        ball_samples,
        records,
        team_map,
        team_model,
        frame_w,
        median_player_h,
        fps_eff,
        step_scale=float(stride),
    )

    # Buts par ARRIVÉE du ballon au fond (complémentaire des tirs). Un but
    # arrivé près d'un tir déjà détecté PROMEUT ce tir en « but » au lieu de
    # dupliquer l'événement ; sinon il est ajouté comme événement à part.
    goals = detect_goals(
        ball_samples,
        records,
        team_map,
        team_model,
        frame_w,
        median_player_h,
        fps_eff,
        step_scale=float(stride),
    )
    merge_cooldown = int(1.5 * fps_eff)
    for g in goals:
        gi = round(g["t"] * fps_eff)
        near: dict | None = None
        for ev in shots:
            if abs(round(ev["t"] * fps_eff) - gi) <= merge_cooldown:
                near = ev
                break
        if near is None:
            shots.append(g)
        else:
            near["type"] = "goal"
            near["on_target"] = True
            if "fond" not in near.get("note", ""):
                near["note"] = g["note"]
    shots.sort(key=lambda ev: ev["t"])

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
            "frames": native_idx,
            "duration_sec": round(idx / fps_eff, 2) if fps_eff > 0 else 0.0,
            "analyzed_frames": idx,
            "frame_stride": stride,
            "analysis_fps": round(fps_eff, 2),
            "imgsz": cfg.IMGSZ,
            "augment": cfg.AUGMENT,
            "sec_per_frame": round(sec_per_frame, 3),
            "analysis_budget_sec": cfg.ANALYSIS_MAX_SEC,
            "timed_out": timed_out,
            # 2e détecteur ballon (union COCO ∪ ball2) — null si désactivé
            "ball_model": cfg.BALL_MODEL_PATH or None,
            "ball2_frames": sum(1 for d in ball2_candidates if d),
            "coco_ball_frames": sum(1 for d in ball_candidates if d),
        },
        "teams": {
            "team1": {
                "label": "Équipe 1",
                "color": team_model.hex_colors[0],
            },
            "team2": {
                "label": "Équipe 2",
                "color": team_model.hex_colors[1],
            },
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
            # Métriques physiques / structure / pression (tactics_metrics).
            # Absentes des anciennes analyses → le front doit les traiter
            # comme optionnelles.
            "physical": physical,
            "structure": structure,
            "pressure": pressure,
        },
        "possession_timeline": possession_timeline,
        "timeline": shots[: cfg.MAX_TIMELINE],
    }
    return result