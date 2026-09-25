# ============================================================
# vision.py — Détection (YOLO8) + suivi multi-objets (ByteTrack)
#
# Le moteur fonctionne sur des images 2D : tout est exprimé en
# pixels. Les seuils métier du module `match_analyzer` sont
# normalisés par la taille apparente des joueurs pour rester
# robustes au zoom / à la distance de prise de vue.
# ============================================================
from __future__ import annotations

from dataclasses import dataclass, field

import cv2
import numpy as np
import supervision as sv
from ultralytics import YOLO

import config as cfg

# ─── Modèle partagé (chargé une seule fois) ───
_MODEL: YOLO | None = None


def get_model() -> YOLO:
    """Retourne le modèle YOLO en singleton pour l'éviter de le
    recharger à chaque vidéo (chargement ~ quelques secondes)."""
    global _MODEL
    if _MODEL is None:
        # weights seul → Ultralytics télécharge le .pt au premier run
        _MODEL = YOLO(cfg.MODEL_NAME)
    return _MODEL


# ============================================================
# Structures de sortie
# ============================================================
@dataclass
class Box:
    """Boîte englobante (pixels) d'un objet détecté dans une frame."""

    x1: float
    y1: float
    x2: float
    y2: float
    confidence: float
    track_id: int | None

    @property
    def cx(self) -> float:
        return (self.x1 + self.x2) / 2

    @property
    def cy(self) -> float:
        return (self.y1 + self.y2) / 2

    @property
    def width(self) -> float:
        return self.x2 - self.x1

    @property
    def height(self) -> float:
        return self.y2 - self.y1

    def as_int(self) -> tuple[int, int, int, int]:
        return int(self.x1), int(self.y1), int(self.x2), int(self.y2)


@dataclass
class FrameObjects:
    """Résultat par frame : joueurs/arbitres trackés + ballon."""

    persons: list[Box] = field(default_factory=list)   # classe COCO 'person'
    balls: list[Box] = field(default_factory=list)     # classe COCO 'sports ball'
    frame_idx: int = 0


# ============================================================
# Pixel de couleur dominante (maillot)
# ============================================================
def median_torso_color(frame: np.ndarray, box: Box) -> np.ndarray | None:
    """Retourne la couleur HSV médiane du torse (zone centrale du
    haut du corps) d'une détection, ou None si la zone est trop
    petite / trop sombre ou blanche.

    On échantillonne le torse : bande verticale entre ~12% et ~48%
    de la hauteur de la boîte, et 25%→75% en largeur (on évite les
    bras et les jambes). Les pixels gris/blancs (faible saturation)
    et trop sombres sont écartés — ils sont ambigus entre équipes.
    """
    x1, y1, x2, y2 = box.as_int()
    h, w = frame.shape[:2]
    y_a = y1 + int((y2 - y1) * 0.12)
    y_b = y1 + int((y2 - y1) * 0.48)
    x_a = x1 + int((x2 - x1) * 0.25)
    x_b = x2 - int((x2 - x1) * 0.25)
    if y_b - y_a < 4 or x_b - x_a < 4:
        return None

    patch = frame[y_a:y_b, x_a:x_b]
    hsv = cv2.cvtColor(patch, cv2.COLOR_BGR2HSV)
    s = hsv[:, :, 1]
    v = hsv[:, :, 2]
    mask = (s > 60) & (v > 70)
    if int(mask.sum()) < 12:  # pas assez de pixels "colorés"
        return None

    sat_pixels = hsv[mask]
    # Médianes teinte/saturation/valeur : couleur "dominante" robuste
    # aux détails (numéros, logos) du maillot.
    return np.median(sat_pixels, axis=0)


HUE_DIST = 180.0  # espace HSV (hue borné en 0..179)


def hsv_distance(c1: np.ndarray, c2: np.ndarray) -> float:
    """Distance HSV perceptive simple : la teinte domine, puis
    saturation et valeur en pénalités secondaires."""
    dh = min(abs(c1[0] - c2[0]), HUE_DIST - abs(c1[0] - c2[0]))
    return float(np.hypot(dh, (c1[1] - c2[1]) * 0.35) + abs(c1[2] - c2[2]) * 0.01)


# ============================================================
# Tracker
# ============================================================
class Tracker:
    """Enveloppe de supervision.ByteTrack : détecte puis suit les
    personnes et le ballon pour conserver des identifiants stables
    d'une frame à l'autre (nécessaire pour les trajectoires)."""

    def __init__(self) -> None:
        try:
            self._tracker = sv.ByteTrack.from_yolox(
                track_activation_threshold=cfg.CONFIDENCE,
                minimum_matching_threshold=0.8,
                lost_track_buffer=60,
            )
        except Exception:
            # supervision < 0.21 : API standard (paramètres positionnels)
            self._tracker = sv.ByteTrack(
                track_activation_threshold=cfg.CONFIDENCE,
                minimum_matching_threshold=0.8,
                lost_track_buffer=60,
            )

    def update(self, frame: np.ndarray, frame_idx: int) -> FrameObjects:
        """Exécute la détection + le suivi sur une frame."""
        results = get_model().predict(
            source=frame, conf=cfg.CONFIDENCE, verbose=False, device="mps"
        )[0]
        detections = sv.Detections.from_ultralytics(results)

        # On ne garde que ce qui nous intéresse : personnes + ballon
        keep = (detections.class_id == cfg.CLASS_PERSON) | (
            detections.class_id == cfg.CLASS_SPORTS_BALL
        )
        detections = detections[keep]

        if len(detections) == 0:
            return FrameObjects(frame_idx=frame_idx)

        tracked = self._tracker.update_with_detections(detections)

        out = FrameObjects(frame_idx=frame_idx)
        for i in range(len(tracked)):
            box = Box(
                x1=float(tracked.xyxy[i][0]),
                y1=float(tracked.xyxy[i][1]),
                x2=float(tracked.xyxy[i][2]),
                y2=float(tracked.xyxy[i][3]),
                confidence=float(tracked.confidence[i]),
                track_id=int(tracked.tracker_id[i]) if tracked.tracker_id is not None else None,
            )
            cls = int(tracked.class_id[i])
            if cls == cfg.CLASS_PERSON:
                out.persons.append(box)
            else:
                out.balls.append(box)
        return out