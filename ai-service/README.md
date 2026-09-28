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
> (`device="mps"`, réglable via `DEVICE=auto`).

## Déploiement en ligne (pour que tous les utilisateurs puissent l'utiliser)

> **Option A (recommandée, zéro daemon) — API de vision externe :**
> le pipeline est empaqueté en modèle Cog sur **Replicate** (`replicate/`)
> et appelé directement depuis Vercel (pay-per-run). Voir
> [`replicate/README.md`](../replicate/README.md). Variables Vercel :
> `REPLICATE_API_TOKEN` (+ `REPLICATE_MODEL`). Le cron
> `/api/video-analysis/cron` rattrape les jobs perdus.
>
> **Option B — worker dédié :** le démon `worker.py` tourne sur une VM /
> un conteneur (Render/Railway). Pour que ce soit 100 % automatique, il
> faut garder ce worker allumé.

Le worker est un **démon** — il doit tourner en permanence sur une VM /
un conteneur. Vercel ne peut PAS l'héberger (fonctions Node serverless,
sans runtime Python persistant ni GPU) : on le déploie à part.

**Option recommandée — Render (Blueprint, 1 clic) :**
1. `ai-service/render.yaml` (fourni) déploie un *Background Worker* Docker en
   consommant la file. Voir les instructions en tête de ce fichier.
2. À la création : renseigner `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY`
   (mêmes valeurs que sur Vercel).
3. Instance *Starter* (~7 $/mo) = toujours allumée. Le plan gratuit* s'endort
   après 15 min sans activité, KO pour un daemon de file d'attente.

**Alternative — Railway :** connecter le repo, Build root = `ai-service`
(Dockerfile), variables identiques. Always-on dès le plan Hobby.

**Variables d'env du worker (n'importe quel hébergeur) :**

| Variable | Défaut | Rôle |
|---|---|---|
| `SUPABASE_URL` | — | requise (projet Supabase) |
| `SUPABASE_SERVICE_ROLE_KEY` | — | requise (worker = écritures sans RLS) |
| `DEVICE` | `auto` | `mps` si dispo (macOS), sinon CPU |
| `MODEL_NAME` | `yolov8m.pt` | modèle YOLO |
| `CONFIDENCE` | `0.25` | seuil détection |
| `POLL_INTERVAL_SEC` | `10` | fréquence de sondage de la file |

> Sur Render à `DEVICE=cpu`, comptez un traitement nettement plus lent que
> sur un Mac MPS : c'est le compromis d'un hébergement CPU sans GPU (le job
> reste borné par `HARD_TIMEOUT_SEC`/`MAX_FRAMES`).

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

## Diagnostic — « l'analyse reste à 0 % »

Une tâche bloquée à `0 %` / `pending` pendant des heures signifie que la
**file n'est pas consommée**. Causes en ordre de probabilité :

1. **Le worker n'est pas lancé.** Rien ne déploie ce démon (par design) :
   il faut `python worker.py` tourner en permanence (systemd, Docker,
   machine dédiée…). Test rapide : lancer le worker en avant-plan et lire
   ses logs — doivent apparaître `Démarrage analyse …` puis des pourcentages.
2. **Migrations non appliquées.** Le worker vérifie au démarrage :
   - table `video_analyses` → migration `106_video_analysis.sql`,
   - RPC `claim_next_video_job` → migration `107_video_security.sql`
     (il bascule alors automatiquement sur une réclamation inline sûre).
   Une erreur explicite au boot vous dit laquelle manque (SQL Editor Supabase).
3. **Erreur réseau/schema silencieuse.** Lancer le worker avec les logs
   visibles : toute erreur de boucle y est tracée. Vérifier aussi que
   `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` du `.env` désignent le bon projet.
4. **Realtime non publié** (l'UI ne se rafraîchit pas) : la page retombe
   sur un polling 20 s, mais vous pouvez publier la table en plus :
   `ALTER PUBLICATION supabase_realtime ADD TABLE video_analyses;`

Une fois le worker actif, le statut évolue en direct : 1 % (démarrage),
puis +5 % par palier, jusqu'à `completed` avec le rapport JSON.

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