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

# Seuils de confiance PAR CLASSE. Le ballon est un petit objet rapide :
# le détecteur COCO ne le sort qu'à très basse confiance (à 0.3 le rappel
# tombe à ~14 % ; à 0.05 il monte à ~60 %). Les personnes, elles, sont
# nettes et supportent un seuil plus élevé (moins de faux positifs).
# CONFIDENCE reste le seuil "historique" (compat), mais chaque classe a
# son propre défaut pour rester correct même si CONFIDENCE n'est pas réglé.
CONFIDENCE = _float("CONFIDENCE", 0.25)
PERSON_CONFIDENCE = _float("PERSON_CONFIDENCE", 0.25)
BALL_CONFIDENCE = _float("BALL_CONFIDENCE", 0.05)
# Seuil brut passé au modèle : on descend au plus bas des deux pour ne
# rien perdre, puis on filtre par classe dans le Tracker.
DETECT_CONFIDENCE = min(PERSON_CONFIDENCE, BALL_CONFIDENCE)

# Device torch pour l'inférence :
#   "auto" → mps si disponible (macOS), sinon cpu (le plus portable).
#   "0"/"1"  → GPU CUDA (index), "cpu" → force CPU.
DEVICE = os.getenv("DEVICE", "auto")


def torch_device() -> str:
    """Résout DEVICE en un device valide pour YOLO (inclut MPS)."""
    if DEVICE == "cpu":
        return "cpu"
    if DEVICE in {"auto", "mps"}:
        try:
            import torch

            if torch.backends.mps.is_available():
                return "mps"
        except ImportError:
            pass
        return "cpu"
    # "0"/"1"/"cuda:0"…
    return DEVICE

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
# Distance min parcourue par le ballon (× hauteur moyenne joueur) entre le
# relâchement par une équipe et le contrôle suivant, pour valider une passe.
PASS_MIN_DIST_FACTOR = _float("PASS_MIN_DIST_FACTOR", 0.8)
SHOT_SPEED_RATIO = _float("SHOT_SPEED_RATIO", 0.35)        # vitesse du ballon / hauteur moyenne joueur (par frame)
GOAL_OPENING_FACTOR = _float("GOAL_OPENING_FACTOR", 4.1)   # largeur de but ≈ 4,1 × hauteur moyenne d'un joueur
# Suivi de trajectoire du ballon : le détecteur (COCO) produit beaucoup de
# faux positifs isolés. On ne retient, frame à frame, que la détection
# cohérente avec la trajectoire (distance de saut ≤ FACTOR × hauteur joueur),
# avec ré-acquisition après N frames sans ballon. Sans ce filtre, la
# trajectoire saute de 900+ px et les tirs/passes sont du bruit.
# FACTOR : un ballon frappé (tir, centre, dégagement) parcourt en une frame
# beaucoup plus que la hauteur d'un joueur — un seuil trop bas (l'ancien 0,5
# ≈ 101 px) REJETAIT les ballons rapides, donc le but/la tête n'était jamais
# détecté et la possession était mesurée sur des miettes (~0,8 s).
BALL_MAX_JUMP_FACTOR = _float("BALL_MAX_JUMP_FACTOR", 1.50)  # × hauteur moyenne joueur
BALL_REACQUIRE_FRAMES = _int("BALL_REACQUIRE_FRAMES", 12)

# Validation d'environnement : on échoue vite si la config est absente
def check_config(require_supabase: bool = True) -> None:
    if require_supabase and (not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY):
        raise RuntimeError(
            "SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis "
            "(voir ai-service/.env.example)"
        )
    if not MODEL_NAME:
        raise RuntimeError("MODEL_NAME est requis")