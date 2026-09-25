# Benchrs — Service d'analyse vidéo IA

Micro-service **Python** qui analyse les vidéos de match uploadées dans
Benchrs (Next.js + Supabase) et produit un rapport JSON (possession,
passes, tirs, tirs cadrés, timeline des temps forts).

Stack : **YOLO8 (Ultralytics)** pour la détection, **ByteTrack
(supervision)** pour le suivi multi-objets, **OpenCV** pour la géométrie.

## Architecture

```
Coach (Next.js) ─ upload vidéo ─▶ Supabase Storage (bucket match_videos)
   │                                      │
   └─ insert row video_analyses (pending) │
                                          ▼
                        Supabase = file d'attente (table video_analyses)
                                          │   polling (claim pending)
                                          ▼
                Worker Python (YOLO + ByteTrack + OpenCV)
                                          │  progress + result JSONB
                                          ▼
                        Supabase → realtime ─▶ Front (dashboard match)
```

- Le passage à l'échelle se fait en lançant plusieurs workers côte à côte
  (chacun réclame la plus ancienne tâche `pending` ; on peut ajouter
  Redis/Celery plus tard si le volume le justifie).
- Pour le MVP, **pas d'`ffmpeg` requis côté Python** : OpenCV lit la vidéo ;
  il faut simplement que le conteneur vidéo soit déchiffrable par OpenCV
  (mp4/h264 recommandé).

## Dossiers

| Fichier           | Rôle                                                        |
| ----------------- | ----------------------------------------------------------- |
| `config.py`       | Configuration par variables d'environnement (+ `.env`)      |
| `vision.py`       | YOLO (singleton), détections, échantillonnage couleur torse |
| `match_analyzer.py`| Pipeline: équipes, possession, passes, tirs, timeline, JSON |
| `supabase_gateway.py` | File d'attente, download vidéo, remontée progress/result |
| `worker.py`       | Démon de polling (boucle infinie)                           |
| `run_local.py`    | Test local sans base (vidéo → fichier JSON)                 |

## Installation & lancement

```bash
cd ai-service
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# 1) Test local hors Supabase (recommandé pour commencer)
cp .env.example .env
python run_local.py ~/Videos/clip30s.mp4 out.json

# 2) Brancher la base
# rentre SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY dans .env
python worker.py
```

> Le premier lancement télécharge automatiquement les poids YOLO
> (`yolov8m.pt`, ~50 Mo). Sur macOS il utilise l'accélération Metal
> (`device="mps"`, déjà réglé dans `vision.py`).

## Plan d'exécution (ordre conseillé)

1. **Base + upload** — Appliquer la migration `106_video_analysis.sql`
   puis tester l'upload dans Supabase Storage depuis le front (voir la
   page `Équipe → Analyse vidéo`).
2. **Moteur Python local** — Analyser un clip de 30 s :
   `python run_local.py clip.mp4` et lire le JSON généré. Ajuster les
   seuils dans `.env` (possession/tirs) tant que les stats paraissent
   grossièrement justes.
3. **Branchement** — Lancer `python worker.py` : il consomme la file.
   Vérifier que le statut passe `pending → processing → completed` et
   que `result` se remplit en base.
4. **Front** — Ne reste plus que l'affichage (déjà en place) : la page
   `Équipe → Analyse vidéo` liste les analyses et affiche le dashboard.

## Métriques calculées (heuristiques 2D)

- **Couleurs d'équipes** : k-means (2 clusters) sur la couleur HSV
  médiane du torse de chaque joueur ; un joueur trop loin des deux
  clusters est classé *arbitre*.
- **Possession** : à chaque frame, l'équipe du joueur le plus proche du
  ballon (rayon max `POSSESSION_RADIUS` px) possède ; hystérésis de
  `POSSESSION_HOLD` frames.
- **Passes** : chaque bascule durable de possession (≥ `PASS_MIN_HOLD_SEC`)
  est comptée comme une passe de l'équipe rendant le ballon.
- **Tirs / cadrés** : le ballon est un « tir » si sa vitesse normalisée
  (`SHOT_SPEED_RATIO` × hauteur joueur) pointe vers une ligne de but et
  y arrive sous ~4 s. *Cadré* si le point d'impact est dans l'ouverture
  du but (≈ 4,1 × hauteur joueur). Un dépassement franc de la ligne de
  but est signalé comme **but probable**.

> Ces métriques sont des heuristiques mono-caméra non calibrées : la
> qualité dépend fortement de l'angle de prise de vue (grand-angle
> pleine largeur recommandé). Elles sont conçues pour être « assez
> justes pour un rapport de match » et jamais présentées comme exactes.