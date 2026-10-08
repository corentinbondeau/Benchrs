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
> (`yolov8n.pt`, ~6 Mo sur CPU ARM ; `yolov8m.pt` ~50 Mo si vous passez
> `MODEL_NAME=yolov8m.pt`). Sur macOS il utilise l'accélération Metal
> (`device="mps"`, réglable via `DEVICE=auto`).

## Déploiement en ligne (pour que tous les utilisateurs puissent l'utiliser)

> **Option unique et retenue (gratuite, 24/7, 100 % indépendante) — VM
> Oracle Cloud Free Tier :** le worker `worker.py` tourne sur une instance
> ARM A1 (4 OCPU / 24 Go RAM, gratuit à vie) via Docker. Le bucket privé et
> la file sont dans Supabase, le worker consomme les jobs automatiquement.
> Voir `deploy-oracle.sh` et la section « Oracle Cloud Free Tier » ci-dessous.
>
> Aucune API externe n'est impliquée (pas de Replicate, pas de paiement par
> analyse) : c'est NOTRE agent de vision, entièrement sous notre contrôle.

Le worker est un **démon** — il doit tourner en permanence sur une VM /
un conteneur. Vercel ne peut PAS l'héberger (fonctions Node serverless,
sans runtime Python persistant ni GPU) : on le déploie à part.

### Oracle Cloud Free Tier (gratuit à vie, 4 vCPU ARM)

1. Créer un compte → **Oracle Cloud Infrastructure** → *Free Tier* (seule
   la création du compte exige une carte bancaire pour vérification,
   elle n'est jamais débitée).
2. Créer une instance **VM.Standard.A1.Flex** (shape Ampere ARM) :
   *Image* = **Ubuntu 24.04**, *OCPU count* = **4**, *RAM* = **24 Go**,
   clé SSH publique (nom du feu d'action "Add SSH keys").
   ⚠ Sélectionner bien la shape A1 **ARM** (gratuite) — les shapes VM.Standard.E2.1.Micro
   sont x86 mais limitées à 1 OCPU (très lentes en YOLO).
3. `ssh ubuntu@<IP>` puis :
   ```bash
   git clone https://github.com/corentinbondeau/Benchrs.git
   cd Benchrs/ai-service
   bash deploy-oracle.sh          # installe Docker + crée le .env à compléter
   # → éditer .env : SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (= valeurs Vercel)
   bash deploy-oracle.sh          # pull image GHCR + service systemd + logs
   ```
   L'image ARM64 est **pré-construite** par le workflow GitHub Actions
   `worker-image.yml` (push sur main → published sur `ghcr.io/
   corentinbondeau/benchrs-worker:arm64`) : la VM ne fait qu'un `docker pull`.
4. Le service `benchrs-worker` redémarre seul au boot.
   Logs : `journalctl -u benchrs-worker -f`.

> **Vitesse ARM CPU** : avec `yolov8n` + downscale 1280×720, une vidéo de
> match de ~30 min est analysée en ~20-40 min. C'est le compromis d'un
> CPU ARM sans GPU. Le job reste borné par `HARD_TIMEOUT_SEC`/`MAX_FRAMES`.

**Variables d'env du worker (n'importe quel hébergeur) :**

| Variable | Défaut | Rôle |
|---|---|---|
| `SUPABASE_URL` | — | requise (projet Supabase) |
| `SUPABASE_SERVICE_ROLE_KEY` | — | requise (worker = écritures sans RLS) |
| `DEVICE` | `auto` | `mps` si dispo (macOS), sinon CPU — forcer `cpu` sur une VM |
| `MODEL_NAME` | `yolov8n.pt` | modèle YOLO (`n` = léger/rapide CPU) |
| `CONFIDENCE` | `0.25` | seuil détection |
| `POLL_INTERVAL_SEC` | `10` | fréquence de sondage de la file |

> Sur CPU (Oracle ARM, Render…), comptez un traitement nettement plus lent
> que sur un Mac MPS : c'est le compromis d'un hébergement sans GPU (le job
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