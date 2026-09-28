# ============================================================
# predict.py — Point d'entrée Cog du modèle Replicate
#
# Réutilise le pipeline complet de ai-service/ (YOLO + ByteTrack +
# OpenCV → rapport JSON au même schéma que le front). Sortie :
# dict sérialisable (meta/teams/stats/timeline), renvoyé par
# l'API Replicate et écrit tel quel dans video_analyses.result.
# ============================================================
import os
import sys

# Le worker distant partage le dépôt : on rend ai-service/ importable.
sys.path.insert(
    0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "ai-service")
)

from cog import BasePredictor, Input, Path  # noqa: E402

import config as cfg  # noqa: E402
from match_analyzer import analyze_video  # noqa: E402
from vision import get_model  # noqa: E402


class Predictor(BasePredictor):
    def setup(self) -> None:
        # Charge YOLO une fois (télécharge ses poids au premier build/run).
        get_model()

    def predict(
        self,
        video: Path = Input(description="Vidéo du match (mp4/mov/webm)"),
    ) -> dict:
        cfg.DEVICE = os.getenv("DEVICE", "cpu")
        return analyze_video(str(video))