# ============================================================
# ball_cues.py — Signaux de détection du ballon COMPLÉMENTAIRES
# du détecteur COCO (classe « sports ball »).
#
# Pourquoi : sur du matériel amateur (vidéo grand-angle d'un
# téléphone), le ballon fait quelques pixels et la classe COCO
# « sports ball » n'est pas entraînée pour ce rendu : elle le sort
# sur ~67 % des frames (grand-angle) / ~91 % (plan serré), à très
# basse confiance, et surtout RATE des phases entières — le ballon
# en plein vol, le moment qui compte pour tirs et passes.
#
# On ajoute donc un signal CLASSIQUE, indépendant du réseau, qui
# complète le détecteur là où il échoue. Un ballon de football se
# décrit en 4 propriétés sur une image de gazon :
#   1. CLAIR      (V élevé)               — contrairement au gazon ;
#   2. ACHROMATIQUE (S faible)            — contrairement au gazon ;
#   3. COMPACT & ROND (circularité ~1)    — contrairement aux
#      lignes de terrain (allongées) et au décor ;
#   4. ISOLÉ      (hors d'un maillot)     — contrairement aux
#      chaussures / chaussettes / logos.
#
# Ces 4 tests tuent progressivement le bruit :
#   masque blanc → taille bornée → aspect → circularité → hors joueur.
#
# Ce module produit des CANDIDATS (cx, cy, score) sur une frame. La
# fusion avec les détections COCO et le suivi de trajectoire se font
# dans `match_analyzer` (une seule source de vérité).
#
# Aucune de ces cues n'est une vérité terrain : chacune est un signal
# bruité qu'on arbitre en aval par la cohérence temporelle.
# ============================================================
from __future__ import annotations

import math
from dataclasses import dataclass

import cv2
import numpy as np

import config as cfg


# ─── Boîtes de joueurs (structurantes pour le rejet) ────────
@dataclass
class PersonBox:
    """Résumé d'une détection « personne » (pixels)."""

    x1: float
    y1: float
    x2: float
    y2: float

    @property
    def height(self) -> float:
        return max(1.0, self.y2 - self.y1)


def _blob_in_person(cx: float, cy: float, r: float, person: PersonBox) -> bool:
    """Le blob est-il DANS ce joueur (maillot / numéro / visage) ?

    Critère volontairement plus sélectif qu'un simple test de
    contact : on n'écarte que les blobs situés au moins à mi-chemin
    des bords bas/gauche/droite de la boîte. Un ballon au PIED d'un
    joueur touche la limite basse de la boîte → il reste admis (c'est
    d'ailleurs la phase la plus fréquente du match, à suivre), alors
    qu'un logo blanc sur la poitrine est franchement intérieur.
    """
    m = r * 0.5
    if not (person.x1 - m <= cx <= person.x2 + m and person.y1 - m <= cy <= person.y2 + m):
        return False
    # Intérieur « profond » : au moins 20 % de la boîte du joueur des
    # deux côtés (on tolère le bas du corps, on refuse le torse).
    inset_x = 0.20 * (person.x2 - person.x1)
    inset_top = 0.15 * (person.y2 - person.y1)
    inset_bottom = 0.25 * (person.y2 - person.y1)
    deep_x = (person.x1 + inset_x) <= cx <= (person.x2 - inset_x)
    deep_y = (person.y1 + inset_top) <= cy <= (person.y2 - inset_bottom)
    return deep_x and deep_y


def _circularity(contour: np.ndarray) -> float:
    """Circularité classique 4π·A / P² : 1.0 = disque parfait,
    0.785 = carré, <0.6 = forme allongée ou fractale (lignes de
    terrain, textes, reflets). C'est LE discriminant du ballon."""
    area = cv2.contourArea(contour)
    if area <= 0:
        return 0.0
    per = cv2.arcLength(contour, True)
    if per <= 0:
        return 0.0
    return float(4.0 * math.pi * area / (per * per))


def white_mask(frame: np.ndarray) -> np.ndarray:
    """Masque binaire (uint8 0/255) des pixels CLAIRS + ACHROMATIQUES.

    C'est le seul passage qui dépend de l'image ; tout le reste
    (taille, aspect, circularité, rejet joueur) ne dépend que de ce
    masque et se retraite sans relire la vidéo — ce qui permet de
    régler les seuils en millisecondes depuis un cache (`bench_cues`).
    """
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    sat = hsv[:, :, 1]
    val = hsv[:, :, 2]
    mask = (val >= cfg.WHITE_V_MIN) & (sat <= cfg.WHITE_S_MAX)
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    return cv2.morphologyEx(mask.astype(np.uint8) * 255, cv2.MORPH_OPEN, k)


def detect_white_ball_from_mask(
    mask_u8: np.ndarray,
    persons: list[PersonBox],
    median_player_h: float,
    stats: dict | None = None,
) -> list[tuple[float, float, float]]:
    """Candidats ballon à partir d'un masque binaire (voir `white_mask`)."""
    if mask_u8 is None or mask_u8.size == 0:
        return []
    h, w = mask_u8.shape[:2]
    ref_h = median_player_h if median_player_h and median_player_h > 0 else 40.0
    ref_h = max(6.0, ref_h)

    def bump(key: str) -> None:
        if stats is not None:
            stats[key] = stats.get(key, 0) + 1

    n, labels, stats_arr, centroids = cv2.connectedComponentsWithStats(mask_u8, 8)

    # 3) Bornes de taille (aires) dérivées de la hauteur du joueur.
    area_min = max(4.0, (cfg.BALL_BLOB_MIN_FACTOR * ref_h) ** 2)
    area_max = max(area_min * 2.0, (cfg.BALL_BLOB_MAX_FACTOR * ref_h) ** 2)
    area_max = min(area_max, 0.25 * w * h)

    out: list[tuple[float, float, float]] = []
    for i in range(1, n):  # 0 = fond
        bump("total")
        area = float(stats_arr[i, cv2.CC_STAT_AREA])
        if area < area_min or area > area_max:
            bump("size")
            continue

        x = stats_arr[i, cv2.CC_STAT_LEFT]
        y = stats_arr[i, cv2.CC_STAT_TOP]
        bw = stats_arr[i, cv2.CC_STAT_WIDTH]
        bh = stats_arr[i, cv2.CC_STAT_HEIGHT]
        if bw <= 2 or bh <= 2:
            bump("size")
            continue

        # 4) Aspect : rejette lignes / traits.
        aspect = bw / bh if bh else 99.0
        if aspect > cfg.BALL_BLOB_ASPECT_MAX or aspect < 1.0 / cfg.BALL_BLOB_ASPECT_MAX:
            bump("aspect")
            continue

        # 5) Circularité sur le CONTOUR : le vrai test « c'est une
        #    boule ». Une ligne de touche morcelée, du texte ou un
        #    reflet allongé échouent ici.
        comp_mask = (labels[y : y + bh, x : x + bw] == i).astype(np.uint8)
        contours, _ = cv2.findContours(comp_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            bump("round")
            continue
        circ = max(_circularity(c) for c in contours)
        if circ < cfg.BALL_BLOB_MIN_CIRCULARITY:
            bump("round")
            continue

        fill = area / float(bw * bh)
        if fill < cfg.BALL_BLOB_MIN_FILL:
            bump("fill")
            continue

        cx, cy = float(centroids[i][0]), float(centroids[i][1])
        radius = max(bw, bh) / 2.0

        # 6) Hors joueur : refuse les logos/numéros au centre du corps.
        if any(_blob_in_person(cx, cy, radius, p) for p in persons):
            bump("person")
            continue

        # 7) Score : circularité × compacité (0 → 1). La clarté est déjà
        #    garantie par le masque (tous les pixels passent WHITE_V_MIN) ;
        #    on ne peut plus la mesurer ici puisque seul le masque arrive.
        score = (
            cfg.BALL_BLOB_SCORE_CIRC_W * circ
            + cfg.BALL_BLOB_SCORE_FILL_W * fill
        )
        score = max(0.0, min(1.0, score))
        if score < cfg.BALL_BLOB_MIN_SCORE:
            bump("score")
            continue
        out.append((cx, cy, round(score, 3)))

    return out


def detect_white_ball(
    frame: np.ndarray,
    persons: list[PersonBox],
    median_player_h: float,
    stats: dict | None = None,
) -> list[tuple[float, float, float]]:
    """Candidats « ballon blanc » sur une frame → [(cx, cy, score)]. API
    utilisée par le pipeline ; `detect_white_ball_from_mask` est l'API
    utilisée par le banc (masque déjà mis en cache)."""
    if frame is None or frame.size == 0:
        return []
    return detect_white_ball_from_mask(
        white_mask(frame), persons, median_player_h, stats
    )
