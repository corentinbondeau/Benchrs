# ============================================================
# Benchrs — Service d'analyse vidéo IA
#
# Configuration injectée via variables d'environnement (fichier
# `.env` à créer depuis `.env.example`).
# ============================================================
import os

from dotenv import load_dotenv

load_dotenv()

# ─── Correctif MPS (macOS) ───────────────────────────────────
# Sur MPS, l'allocateur de mémoire Metal sature au bout de ~100-200 frames
# et le process RESTE BLOQUÉ plusieurs minutes sur un appel `predict()` (observé :
# 175 frames en 9 s puis un gel de >4 min). Ce gel rendait aussi
# `estimate_sec_per_frame` instable → `stride` NON déterministe d'un run à
# l'autre. Désactiver le « high watermark » supprime totalement le gel (mesuré :
# 400 frames en 24,7 s, stables). À poser AVANT tout import de torch / première
# allocation MPS (`setdefault` = la variable d'env reste prioritaire si fournie).
os.environ.setdefault("PYTORCH_MPS_HIGH_WATERMARK_RATIO", "0.0")


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

# nano (yolov8n) est en fait le MEILLEUR rappel ballon mesuré : sur la vidéo
# grand-angle, m@1600 sort le ballon sur 49 % des frames contre 65 % pour
# n@1600 — les gros modèles COCO sont plus « sûrs » et manquent le ballon
# minuscule. nano est aussi ~3× plus rapide, ce qui libère du budget pour la
# résolution et le TTA (voir ci-dessous).
MODEL_NAME = os.getenv("MODEL_NAME", "yolov8n.pt")

# Résolution d'inférence. Le ballon est un objet de quelques pixels : à la
# taille par défaut (640) le détecteur COCO le rate massivement (mesuré sur
# une vidéo de match grand-angle : 18 % des frames). Le rappel ballon MONTE
# avec la résolution : 1280 → ~51 %, 1600 → ~65 %. On prend 1600 par défaut.
IMGSZ = _int("IMGSZ", 1600)

# Test-Time Augmentation (multi-échelle + flip) : le levier le plus rentable
# pour le ballon (objet minuscule). Mesuré : ballon 65 % → 68 % (grand-angle) et
# 78 % → 92 % (plan serré), personnes +15 %. Coût ~2×, absorbé par le budget
# d'analyse ci-dessous (échantillonnage temporel).
AUGMENT = _bool("AUGMENT", True)

# Seuils de confiance PAR CLASSE. Le ballon est un petit objet rapide :
# le détecteur COCO ne le sort qu'à très basse confiance (à 0.3 le rappel
# tombe à ~14 % ; à 0.05 il monte à ~60 %). Les personnes, elles, sont
# nettes et supportent un seuil plus élevé (moins de faux positifs).
# CONFIDENCE reste le seuil "historique" (compat), mais chaque classe a
# son propre défaut pour rester correct même si CONFIDENCE n'est pas réglé.
CONFIDENCE = _float("CONFIDENCE", 0.25)
PERSON_CONFIDENCE = _float("PERSON_CONFIDENCE", 0.25)
BALL_CONFIDENCE = _float("BALL_CONFIDENCE", 0.05)
# 2e détecteur ballon (modèle dédié football-ball). Optionnel.
# Exemple : /tmp/benchrs_videos/yolo-football-ball-detection.pt
BALL_MODEL_PATH = os.getenv("BALL_MODEL_PATH", "")
BALL_MODEL_IMGSZ = _int("BALL_MODEL_IMGSZ", 1600)
BALL_MODEL_CONF = _float("BALL_MODEL_CONF", 0.05)
BALL_MODEL_AUGMENT = _bool("BALL_MODEL_AUGMENT", False)
# Fusion des candidats ballon (COCO ∪ ball2)
BALL_MERGE_RADIUS_FACTOR = _float("BALL_MERGE_RADIUS_FACTOR", 0.5)  # × hauteur joueur
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
WARMUP_SEC = _float("WARMUP_SEC", 4.0)             # (déprécié) ancien warmup couleur
# Budget d'analyse (secondes de calcul). La détection tourne à qualité MAXIMALE
# (résolution 1600 + TTA) ; pour tenir dans ce budget sur des vidéos longues, le
# pipeline ÉCHANTILLONNE temporellement (une frame analysée toutes les `stride`
# frames) au lieu de dégrader la qualité. `stride` est calculé après calibration
# du coût réel d'une frame (voir `CALIB_FRAMES`). 0 = pas de budget (analyse
# toutes les frames, garde-fou HARD_TIMEOUT_SEC seul).
ANALYSIS_MAX_SEC = _float("ANALYSIS_MAX_SEC", 300.0)
# Marge de sécurité sur l'estimation du coût/frame : le matériel est plus rapide
# à froid que sous charge prolongée (mesuré : MPS ~115 ms à froid → ~250 ms après
# plusieurs minutes ; CPU ARM ~1 s). On multiplie l'estimation par ce facteur
# pour que le budget soit TENU même en régime throttlé (coût : stride un peu plus
# grand, donc un peu moins de frames analysées — jamais la qualité par frame).
ANALYSIS_SAFETY_FACTOR = _float("ANALYSIS_SAFETY_FACTOR", 2.0)
CALIB_FRAMES = _int("CALIB_FRAMES", 20)             # frames mesurées pour estimer le coût/frame
MAX_FRAMES = _int("MAX_FRAMES", 60000)             # garde-fou (~33 min @ 30 fps) — DoS RAM/GPU
HARD_TIMEOUT_SEC = _int("HARD_TIMEOUT_SEC", 900)   # garde-fou temps dur (15 min) — filet de sécurité
MAX_VIDEO_WIDTH = _int("MAX_VIDEO_WIDTH", 1920)    # downscale d'analyse (limite mémoire/CPU de décodage)
MAX_VIDEO_HEIGHT = _int("MAX_VIDEO_HEIGHT", 1080)
PROGRESS_STEP = _int("PROGRESS_STEP", 5)           # % entre deux mises à jour DB (20 écritures max)
HEARTBEAT_SEC = _int("HEARTBEAT_SEC", 30)          # touche le job en cours pour échapper au re-claim
MAX_TIMELINE = _int("MAX_TIMELINE", 500)           # cap des events remontés au front (anti-DoS rendu)

# Seuils métier (heuristiques, calibrés sur des vidéos full-width smartphone).
#
# IMPORTANT — les rayons/distance sont exprimés en MULTIPLES de la hauteur
# apparente d'un joueur, jamais en pixels absolus : l'échelle change d'un
# facteur ~7 entre un plan large (joueur ≈ 26 px) et un plan serré (≈ 178 px),
# si bien qu'un seuil en pixels est soit trop grand en grand-angle (le ballon
# « appartient » à un joueur situé à 5 hauteurs de lui → possession ~50/50),
# soit trop petit en plan serré (plus personne n'est « proche » du ballon).
POSSESSION_RADIUS = _float("POSSESSION_RADIUS", 140.0)     # px, repli si la hauteur joueur est inconnue
# Rayon d'une « touche » (contrôle) = FACTOR × hauteur moyenne joueur.
POSSESSION_RADIUS_FACTOR = _float("POSSESSION_RADIUS_FACTOR", 1.8)
POSSESSION_HOLD = _int("POSSESSION_HOLD", 3)               # frames de confirmation avant changer de possesseur
# ─── Passes (calibré sur vérité terrain v1 : bleues=10, blanc/noir=2) ───
# Les rayons sont ASYMÉTRIQUES (sweep sur la vérité terrain : err 7→4 sur
# COCO) : le LÂCHER est strict, le (RE)CONTRÔLE est large — le receveur
# court vers le ballon et le but est de rattcher les actions même quand
# aucun joueur n'est exactement dessus.
# Rayon du (re)contrôle « le ballon est à portée » = FACTOR × possession_radius.
PASS_CTRL_RADIUS_FACTOR = _float("PASS_CTRL_RADIUS_FACTOR", 8.0)
# Plafond du rayon de contrôle en fraction de la largeur de frame : en plan
# serré (h grand), FACTOR × possession_radius déborde du cadre et « tout le
# monde est à portée » — on borne à la géométrie réelle de l'image.
PASS_CTRL_MAX_FRAME_FRACTION = _float("PASS_CTRL_MAX_FRAME_FRACTION", 0.45)
# Rayon du LÂCHER (hystérésis) : au-delà, le passeur a vraiment quitté le
# ballon — ne pas déclarer un vol tant que le ballon reste proche d'un joueur.
PASS_RADIUS_FACTOR = _float("PASS_RADIUS_FACTOR", 2.0)
# Frames de confirmation du LÂCHER : 3 évite de déclencher un vol sur un
# simple trou de détection du joueur.
PASS_RELEASE_HOLD = _int("PASS_RELEASE_HOLD", 3)
# Frames de confirmation d'un (re)contrôle de passe (1 = la transition vol →
# contrôle est déjà un événement discret, inutile d'insister).
PASS_HOLD = _int("PASS_HOLD", 1)
# Durée max (s) d'un vol : au-delà, le ballon est sorti du cadre / perdu —
# un récontrôle plus tard n'est plus la même action (un vieux code laissait
# des « passes » de 13-40 s comptabilisées).
PASS_MAX_FLIGHT_SEC = _float("PASS_MAX_FLIGHT_SEC", 4.0)
# Distance min parcourue par le ballon (× hauteur moyenne joueur) entre le
# relâchement et le contrôle suivant, pour valider une passe.
PASS_MIN_DIST_FACTOR = _float("PASS_MIN_DIST_FACTOR", 0.3)
SHOT_SPEED_RATIO = _float("SHOT_SPEED_RATIO", 0.35)        # vitesse du ballon / hauteur moyenne joueur (par frame)
# Saut max plausible du ballon entre 2 frames (× hauteur joueur) : écarte les
# faux positifs francs (ex. tête de joueur prise pour le ballon) sans rejeter
# un vrai tir/centre (qui dépasse la hauteur d'un joueur par frame en plan serré).
SHOT_MAX_STEP_FACTOR = _float("SHOT_MAX_STEP_FACTOR", 2.0)
# Un tir est pris PRÈS du but attaqué : le ballon, au moment de la frappe, doit
# être dans cette fraction (du bord) de la largeur du terrain côté but visé.
# Sans ce garde-fou, tout ballon rapide vers le bord de l'image (le seul « but »
# estimable sans calibration) était compté comme tir → faux positifs en série.
SHOT_GOAL_ZONE_FRACTION = _float("SHOT_GOAL_ZONE_FRACTION", 0.35)
# Projection de la frappe hors de l'amplitude verticale (y) du terrain
# couverte par les joueurs (× amplitude) : le ballon projeté finit bien
# au-delà de la bande de jeu = la « frappe » part vers la touche, pas vers
# le but (y_hit explose hors cadre) → faux tir rejeté.
SHOT_Y_MARGIN_FACTOR = _float("SHOT_Y_MARGIN_FACTOR", 1.0)
# Après une frappe, si le ballon atteint la zone du fond puis REVIENT
# profondément en jeu (au-delà de MARGIN × reach de la ligne) dans
# GOAL_RETURN_GUARD_SEC secondes, c'est un échange/dégagement qui finit au
# fond — pas un tir isolé (un vrai tir sort et reste dehors, ou reste au
# filet). Marge 1.0 pour les tirs (marge plus stricte que les buts) : un
# retour même modeste signe une remise en jeu, pas la suite d'une frappe.
SHOT_RETURN_MARGIN_FACTOR = _float("SHOT_RETURN_MARGIN_FACTOR", 1.0)
# Largeur de la zone « près du fond » où un dégagement s'arrête souvent sans
# entrer dans le reach strict (× reach) : atteindre cette zone PUIS revenir
# en jeu = échange, pas un tir isolé.
SHOT_NEAR_ZONE_FACTOR = _float("SHOT_NEAR_ZONE_FACTOR", 2.0)
GOAL_OPENING_FACTOR = _float("GOAL_OPENING_FACTOR", 4.1)   # largeur de but ≈ 4,1 × hauteur moyenne d'un joueur
# ─── Détection des BUTS (arrivée du ballon) ───
# Le « tir » exige une frappe rapide repérée dans la zone du but — cela RATE les
# buts dont la frappe n'est pas vue (ballon masqué, tête, ballon déjà dans la
# surface). On détecte donc AUSSI un but par l'ARRIVÉE du ballon : s'il atteint
# l'extrémité du terrain (le but) à vitesse suffisante et dans l'ouverture du
# but, c'est un but.
# Fraction de la largeur du terrain (depuis chaque extrémité) considérée comme
# « au but ». 0.05 = le ballon doit atteindre les 5 % extrêmes du bord.
GOAL_REACH_FRACTION = _float("GOAL_REACH_FRACTION", 0.05)
# Vitesse horizontale minimale du ballon vers le but (× hauteur joueur, par
# frame analysée) pour valider l'arrivée — un ballon qui « traîne » au fond
# n'est pas un but, il faut qu'il y arrive lancé.
GOAL_ARRIVAL_MIN_SPEED_FACTOR = _float("GOAL_ARRIVAL_MIN_SPEED_FACTOR", 0.30)
# Fenêtre (frames analysées) sur laquelle est mesurée la vitesse d'arrivée.
GOAL_ARRIVAL_WINDOW = _int("GOAL_ARRIVAL_WINDOW", 3)
# Cohérence par PAS dans la fenêtre d'arrivée (× hauteur joueur, par frame
# analysée) : un déplacement entre deux échantillons consécutifs au-delà de ce
# seuil est une téléportation de détection (ballon perdu → relocalisé à
# l'autre bout du terrain), pas une vraie trajectoire → faux but rejeté.
# 1.5 ≈ 1100 px/s en vue grand-angle, largement au-dessus d'une vraie frappe.
GOAL_MAX_STEP_FACTOR = _float("GOAL_MAX_STEP_FACTOR", 1.5)
# Garde-fou « le ballon revient en jeu » : après l'arrivée au fond, si le
# ballon réapparaît au-delà de GOAL_RETURN_MARGIN_FACTOR × reach au-delà de
# la ligne (dans les GOAL_RETURN_GUARD_SEC secondes), c'était un
# dégagement/clearance qui frôle la ligne puis rebondit, pas un but
# (un vrai but reste dans le filet ou disparaît de la vue).
GOAL_RETURN_GUARD_SEC = _float("GOAL_RETURN_GUARD_SEC", 5.0)
GOAL_RETURN_MARGIN_FACTOR = _float("GOAL_RETURN_MARGIN_FACTOR", 2.0)
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
# Comblement des TROUS COURTS de la trajectoire du ballon (interpolation
# linéaire entre deux détections successives). Le détecteur rate le ballon sur
# une grande partie des frames ; sans comblement la possession n'était mesurée
# que sur ~4 s d'une vidéo de 2 min (pourcentage sans valeur). Au-delà de cette
# borne (frames), on ne comble pas : on ignore où est le ballon et l'inventer
# fausserait la lecture. N'affecte PAS la détection des tirs (qui travaille sur
# les échantillons RÉELS).
BALL_INTERP_MAX_GAP = _int("BALL_INTERP_MAX_GAP", 15)
# Possession : quand le ballon n'est pas détecté, on prolonge le DERNIER
# possesseur (le ballon est « en jeu » même s'il est momentanément hors cadre ou
# masqué). 0 = illimité (on mesure toute la durée à partir de la 1re détection,
# pour ne pas laisser hors-stat les phases où le détecteur perd le ballon).
POSSESSION_MAX_LOST_SEC = _float("POSSESSION_MAX_LOST_SEC", 0.0)
# Nombre minimum d'échantillons de couleur pour qu'un track serve à CALIBRER le
# modèle d'équipes (les tracks vus 1-2 fois polluent le k-means). Les tracks
# sous ce seuil sont quand même classés (par leur propre couleur).
MIN_TRACK_SAMPLES_FOR_MODEL = _int("MIN_TRACK_SAMPLES_FOR_MODEL", 3)

# ─── Signaux classiques du ballon (ball_cues.py) ────────────
# Le ballon de football est un objet petit, CLAIR et ACHROMATIQUE sur le gazon.
# Ces seuils bornent le candidat « pastille blanche compacte » hors joueur.
WHITE_V_MIN = _int("WHITE_V_MIN", 165)      # V (0-255) min du « blanc exposé »
WHITE_S_MAX = _int("WHITE_S_MAX", 70)       # S (0-255) max : gris/blanc non coloré
# Taille de la pastille, en multiples de la hauteur apparente d'un joueur
# (comme tous les seuils du pipeline → robuste au zoom / à la distance).
BALL_BLOB_MIN_FACTOR = _float("BALL_BLOB_MIN_FACTOR", 0.12)   # diamètre min ≈ 0,12 h
BALL_BLOB_MAX_FACTOR = _float("BALL_BLOB_MAX_FACTOR", 0.55)   # diamètre max ≈ 0,55 h
BALL_BLOB_ASPECT_MAX = _float("BALL_BLOB_ASPECT_MAX", 1.9)    # rejette lignes/touches
BALL_BLOB_MIN_FILL = _float("BALL_BLOB_MIN_FILL", 0.60)       # rejet des formes creuses
# Circularité 4πA/P² (1 = disque) : LE test « c'est une boule ». Mesuré : à 0.70
# les lignes de terrain morcelées et le décor disparaissent, le ballon reste.
BALL_BLOB_MIN_CIRCULARITY = _float("BALL_BLOB_MIN_CIRCULARITY", 0.70)
BALL_BLOB_MIN_SCORE = _float("BALL_BLOB_MIN_SCORE", 0.45)     # plancher de crédibilité
BALL_BLOB_SCORE_CIRC_W = _float("BALL_BLOB_SCORE_CIRC_W", 0.60)
BALL_BLOB_SCORE_FILL_W = _float("BALL_BLOB_SCORE_FILL_W", 0.40)

# ─── Fusion des signaux ballon ──────────────────────────────
# Un candidat classique et un détecteur COCO qui tombent DANS LA MÊME pastille
# ne sont QU'UN ballon (sinon on double les comptes). Chevauchement accepté en
# multiples du rayon.
BALL_CUE_MERGE_RADIUS_FACTOR = _float("BALL_CUE_MERGE_RADIUS_FACTOR", 1.2)

# ─── Métriques physiques & structure (tactics_metrics.py) ───
# Conversion px → m via la hauteur apparente médiane d'un joueur
# (1,85 m ↔ median_player_h px). Estimation RELATIVE (pas d'homographie) :
# à comparer entre équipes, pas à lire comme une mesure GPS.
PHYSICS_PLAYER_HEIGHT_M = _float("PHYSICS_PLAYER_HEIGHT_M", 1.85)
# Vitesse au-delà de laquelle un déplacement compte en « haute intensité ».
HIGH_INTENSITY_KMH = _float("HIGH_INTENSITY_KMH", 14.0)
# Borne physique : un joueur (ou une boîte glitchée) ne peut pas « se déplacer »
# plus vite que ça entre deux frames. Remplace un simple seuil en pixels, qui
# échoue en haute cadence (à 50 fps, 3 × hauteur en px = ~1000 km/h autorisés).
# 45 km/h = marge au-dessus du pic d'un joueur pro (~36) pour absorber le
# bruit de centre de boîte ; au-delà = téléportation de détection.
PHYS_MAX_SPEED_KMH = _float("PHYS_MAX_SPEED_KMH", 45.0)
# Un track absent plus longtemps est une fragmentation ByteTrack (nouvel id)
# : relier ses positions de part et d'autre inventerait un déplacement.
PHYS_MAX_GAP_SEC = _float("PHYS_MAX_GAP_SEC", 1.2)
# Timeline de possession : les segments plus courts que ça sont absorbés
# dans le voisin (clignotements d'hystérésis) pour un rendu lisible.
POSSESSION_SEGMENT_MIN_SEC = _float("POSSESSION_SEGMENT_MIN_SEC", 3.0)

# Validation d'environnement : on échoue vite si la config est absente
def check_config(require_supabase: bool = True) -> None:
    if require_supabase and (not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY):
        raise RuntimeError(
            "SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis "
            "(voir ai-service/.env.example)"
        )
    if not MODEL_NAME:
        raise RuntimeError("MODEL_NAME est requis")

# (note: BALL_MODEL_PATH vide par défaut → pipeline n'utilise QUE COCO pour le ballon)
