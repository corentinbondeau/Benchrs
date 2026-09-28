# ============================================================
# Benchrs — Service d'analyse vidéo IA
#
# Configuration injectée via variables d'environnement (fichier
# `.env` à créer depuis `.env.example`).
# ============================================================
import os

from dotenv import load_dotenv

load_dotenv()


def _int(name: str, default: int) -> int:
    return int(os.getenv(name, default))


def _float(name: str, default: float) -> float:
    return float(os.getenv(name, default))


def _bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


# ─── Supabase ────────────────────────────────────────────────
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
VIDEO_BUCKET = os.getenv("VIDEO_BUCKET", "match_videos")

# ─── File d'attente ──────────────────────────────────────────
POLL_INTERVAL_SEC = int(os.getenv("POLL_INTERVAL_SEC", "10"))
DOWNLOAD_TIMEOUT_SEC = int(os.getenv("DOWNLOAD_TIMEOUT_SEC", "900"))

# ─── Modèle de vision ────────────────────────────────────────
# YOLO8 : classe 0 = personne, classe 32 = ballon (COCO).
CLASS_PERSON = 0
CLASS_SPORTS_BALL = 32

MODEL_NAME = os.getenv("MODEL_NAME", "yolov8m.pt")   # m = bon compromis perf/qualité
CONFIDENCE = _float("CONFIDENCE", 0.25)

# ─── Traitement vidéo ────────────────────────────────────────
WARMUP_SEC = _float("WARMUP_SEC", 4.0)             # frames utilisées pour apprendre les couleurs de maillots
MAX_FRAMES = _int("MAX_FRAMES", 60000)             # garde-fou (~33 min @ 30 fps) — DoS RAM/GPU
HARD_TIMEOUT_SEC = _int("HARD_TIMEOUT_SEC", 2700)  # garde-fou temps dur (45 min) — vidéos pathologiques
MAX_VIDEO_WIDTH = _int("MAX_VIDEO_WIDTH", 1920)    # downscale d'analyse (limite mémoire/CPU de décodage)
MAX_VIDEO_HEIGHT = _int("MAX_VIDEO_HEIGHT", 1080)
PROGRESS_STEP = _int("PROGRESS_STEP", 5)           # % entre deux mises à jour DB (20 écritures max)
HEARTBEAT_SEC = _int("HEARTBEAT_SEC", 30)          # touche le job en cours pour échapper au re-claim
MAX_TIMELINE = _int("MAX_TIMELINE", 500)           # cap des events remontés au front (anti-DoS rendu)

# Seuils métier (heuristiques, calibrés sur des vidéos full-width smartphone)
POSSESSION_RADIUS = _float("POSSESSION_RADIUS", 140.0)     # px, rayon max autour du ballon pour "toucher" le ballon
POSSESSION_HOLD = _int("POSSESSION_HOLD", 3)               # frames de confirmation avant changer de possesseur
PASS_MIN_HOLD_SEC = _float("PASS_MIN_HOLD_SEC", 0.4)       # durée min de contrôle avant qu'un changement = une passe
SHOT_SPEED_RATIO = _float("SHOT_SPEED_RATIO", 0.35)        # vitesse du ballon / hauteur moyenne joueur (par frame)
GOAL_OPENING_FACTOR = _float("GOAL_OPENING_FACTOR", 4.1)   # largeur de but ≈ 4,1 × hauteur moyenne d'un joueur

# Validation d'environnement : on échoue vite si la config est absente
def check_config(require_supabase: bool = True) -> None:
    if require_supabase and (not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY):
        raise RuntimeError(
            "SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis "
            "(voir ai-service/.env.example)"
        )
    if not MODEL_NAME:
        raise RuntimeError("MODEL_NAME est requis")