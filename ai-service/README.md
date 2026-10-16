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
> (`yolov8n.pt`, ~6 Mo — c'est le modèle par défaut ET le meilleur rappel
> ballon ; les gros modèles `yolov8s/m/l.pt` sont plus lents et **ratent
> davantage** le ballon minuscule). Sur macOS il utilise l'accélération Metal
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

> **Vitesse & qualité (CPU ou GPU)** : la détection tourne à qualité
> **maximale** (résolution 1600 + TTA). Sur un matériel lent, le pipeline
> **échantillonne temporellement** (analyse 1 frame sur `stride`) pour tenir
> `ANALYSIS_MAX_SEC` (5 min par défaut) : c'est le **nombre de frames
> analysées** qui diminue, jamais la qualité par frame. Le pas `stride` est
> calculé après calibration du coût réel d'une frame. Le job reste en plus
> borné par `HARD_TIMEOUT_SEC`/`MAX_FRAMES`.

**Échantillonnage temporel (budget d'analyse).** Le levier de fiabilité est la
détection (résolution + TTA) ; pour rester dans le budget sur une vidéo longue
sans dégrader cette qualité, `analyze_video` estime le coût d'une frame
(`estimate_sec_per_frame`, `CALIB_FRAMES` frames réparties sur la vidéo, ×
`ANALYSIS_SAFETY_FACTOR`) puis choisit le plus petit `stride` tel que
`native_total / stride` frames tiennent dans `ANALYSIS_MAX_SEC`. Les seuils
« par frame » qui en dépendent (saut et vitesse du ballon) sont multipliés par
`stride` (dans `detect_shots` via `step_scale`) pour garder un seuil **physique**
constant. Le champ `meta` du rapport expose `frame_stride`, `analysis_fps`,
`imgsz`, `augment`, `sec_per_frame` et `timed_out`.

**Variables d'env du worker (n'importe quel hébergeur) :**

| Variable | Défaut | Rôle |
|---|---|---|
| `SUPABASE_URL` | — | requise (projet Supabase) |
| `SUPABASE_SERVICE_ROLE_KEY` | — | requise (worker = écritures sans RLS) |
| `DEVICE` | `auto` | `mps` si dispo (macOS), sinon CPU — forcer `cpu` sur une VM |
| `MODEL_NAME` | `yolov8n.pt` | modèle YOLO — **nano par défaut** : meilleur rappel ballon et ~3× plus rapide (les gros modèles ratent davantage le ballon) |
| `IMGSZ` | `1600` | résolution d'inférence — le ballon (quelques px) est raté à 640 (~18 % des frames) ; le rappel monte avec la résolution (1280 → ~51 %, 1600 → ~65 %) |
| `AUGMENT` | `true` | Test-Time Augmentation (multi-échelle + flip) : meilleur rappel ballon (65 % → 68 % grand-angle, 78 % → 92 % plan serré) et +15 % personnes. Coût ~2×, absorbé par le budget d'analyse |
| `ANALYSIS_MAX_SEC` | `300` | budget de calcul par vidéo (s) : au-delà, l'analyse **échantillonne** (voir ci-dessous) au lieu de dégrader la qualité. `0` = désactiver |
| `ANALYSIS_SAFETY_FACTOR` | `2.0` | marge sur l'estimation du coût/frame (le matériel throttlé est ~2× plus lent qu'à froid) — garantit que le budget est tenu |
| `CALIB_FRAMES` | `20` | frames (réparties sur la vidéo) mesurées pour estimer le coût/frame et choisir le pas d'échantillonnage |
| `PERSON_CONFIDENCE` | `0.25` | seuil détection **personne** |
| `BALL_CONFIDENCE` | `0.05` | seuil détection **ballon** (bas : petit objet rapide) |
| `BALL_MAX_JUMP_FACTOR` | `1.50` | saut max du ballon (× hauteur joueur) pour suivre sa trajectoire |
| `POSSESSION_RADIUS` | `140` | repli (px) si la hauteur d'un joueur est inconnue (possession/passes) |
| `POSSESSION_RADIUS_FACTOR` | `1.8` | rayon d'une « touche » = FACTOR × hauteur d'un joueur (possession/passes, s'adapte au zoom) |
| `SHOT_MAX_STEP_FACTOR` | `2.0` | saut max plausible du ballon (× hauteur joueur) pour un tir (écarte les faux positifs, garde les vrais tirs) |
| `SHOT_GOAL_ZONE_FRACTION` | `0.35` | un tir doit être pris près du but attaqué : le ballon, à la frappe, est dans cette fraction (du bord) de la largeur du terrain |
| `GOAL_OPENING_FACTOR` | `4.1` | largeur de but estimée = FACTOR × hauteur d'un joueur (bande verticale d'un but) |
| `GOAL_REACH_FRACTION` | `0.05` | fraction de la largeur du terrain (depuis chaque extrémité) considérée comme « au but » (arrivée du ballon) |
| `GOAL_ARRIVAL_MIN_SPEED_FACTOR` | `0.30` | vitesse minimale du ballon vers le but (× hauteur joueur, par frame) pour valider une arrivée |
| `GOAL_ARRIVAL_WINDOW` | `3` | fenêtre (frames) de mesure de la vitesse d'arrivée du ballon |
| `BALL_INTERP_MAX_GAP` | `15` | comblement des trous courts de la trajectoire du ballon (frames) — sinon la possession n'est mesurée que sur ~3 % de la vidéo |
| `POSSESSION_MAX_LOST_SEC` | `0` | durée max (s) pendant laquelle le dernier possesseur garde la balle quand elle n'est plus détectée ; `0` = illimité (tous les moments en jeu comptent) |
| `MIN_TRACK_SAMPLES_FOR_MODEL` | `3` | nombre minimal d'échantillons d'un track pour calibrer le k-means des couleurs (les tracks vus 1-2× faussaient les centroïdes) |
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

## Diagnostic — « l'analyse finit mais toutes les stats sont à 0 »

Trois pièges se combinaient pour produire des stats nulles sur une vidéo
smartphone parfaitement exploitable :

1. **Orientation non appliquée (le plus grave).** Une vidéo filmée en
   portrait est stockée « couchée » avec un flag de rotation
   (`CAP_PROP_ORIENTATION_META = 90/270`). Par défaut **OpenCV n'applique
   pas** cette rotation → les frames sortent tournées de 90°, les joueurs
   et le ballon ne sont (presque) pas détectés. Correctif : `analyze_video`
   passe `cap.set(cv2.CAP_PROP_ORIENTATION_AUTO, 1)` **avant** de lire la
   taille. Ne JAMAIS re-tourner via `ORIENTATION_META` : le flag garde sa
   valeur d'origine même quand AUTO a déjà tourné (double rotation).
2. **Seuil de confiance trop haut pour le ballon.** Le détecteur COCO ne
   sort le ballon (`sports ball`, classe 32) qu'à très basse confiance :
   à `0.3` le rappel tombe à ~14 %, à `0.05` il monte à ~60 %. D'où un
   seuil **par classe** (`BALL_CONFIDENCE=0.05`, `PERSON_CONFIDENCE=0.25`)
   et un seuil brut unique `min(...)` passé au modèle, filtré ensuite.
3. **ByteTrack avalait le ballon.** Le ballon passait par le tracker qui
   en rejetait la majorité (195 détections brutes → 22 suivies / 200
   frames). Il n'a pas besoin d'un `track_id` → il est gardé en détection
   brute ; seules les personnes passent par ByteTrack (besoin d'IDs stables
   pour l'échantillonnage couleur).

En complément, la trajectoire du ballon est **filtrée par continuité**
(`select_ball_track`) : le détecteur produit des faux positifs isolés, et
prendre à chaque frame la détection la plus confiante fait sauter la
trajectoire de 900+ px (possession/tirs = bruit). On ne retient que la
détection cohérente avec la position prédite (saut ≤
`BALL_MAX_JUMP_FACTOR` × hauteur joueur), avec ré-acquisition après
`BALL_REACQUIRE_FRAMES`. Les vitesses de tir ne sont mesurées qu'entre
frames **consécutives** (un saut après un trou n'est pas une vitesse).

> ⚠️ **`BALL_MAX_JUMP_FACTOR` trop bas = on rate les buts.** Un ballon
> frappé (tir, centre, tête) parcourt en une frame bien plus que la hauteur
> d'un joueur. Avec l'ancien seuil `0.5` (≈ 101 px), les ballons rapides
> étaient rejetés : le but n'était jamais détecté et la possession n'était
> mesurée que sur les rares frames de contact (~0,8 s → pourcentages
> absurdes type 90/10 sur une vidéo de 11 s). Le seuil est passé à `1.50`.

> ⚠️ Après modification du worker, il faut **redémarrer** le démon et
> **ré-analyser** la vidéo : un job déjà `completed` garde son ancien
> `result` (aucun recalcul automatique).

## Métriques calculées (heuristiques 2D)

- **Couleurs d'équipes** : k-means (2 clusters) sur la couleur HSV
  médiane du torse de chaque joueur ; un joueur trop loin des deux
  clusters est classé *arbitre*. Le modèle est calibré uniquement sur les
  tracks vus au moins `MIN_TRACK_SAMPLES_FOR_MODEL` fois (les tracks
  furtifs à 1-2 échantillons faisaient dériver les centroïdes). Une fois le
  modèle fixé, **toutes** les décisions d'équipe (possession, passes,
  équipe du tireur) passent par la même fonction : l'équipe d'un joueur est
  celle de son **track** (médiane robuste), sinon la couleur de **sa**
  détection. Un maillot ne peut donc plus être classé différemment d'un
  calcul à l'autre — c'est ce qui faisait compter une passe pour la
  mauvaise équipe (voire pour les deux).
- **Possession** : à chaque frame où le ballon est suivi, l'équipe du
  joueur le **plus proche** du ballon possessionne (hystérésis de
  `POSSESSION_HOLD` frames pour éviter le clignotement). On ne filtre **pas**
  par un rayon en pixels : exiger une « touche » (joueur à moins de N px)
  rendait le résultat **instable** et dépendant d'un seuil — en grand-angle un
  ballon à ~5 hauteurs d'un joueur (donc clairement à l'équipe adverse)
  basculait d'une équipe à l'autre selon le seuil, d'où une possession
  **~50/50 non représentative**. Prendre toujours l'équipe la plus proche est
  décisif et reproductible. Quand aucun joueur n'est détecté (ballon hors
  cadre, masqué), le **dernier possesseur** garde la possession jusqu'à
  `POSSESSION_MAX_LOST_SEC` (`0` = toute la vidéo) : **tous les moments en jeu
  sont ainsi comptés**. Le `measured_sec` remonté est la durée réellement
  attribuée (dénominateur du %) — on vise ~100 % de la durée de la vidéo.
- **Passes** : on mémorise l'équipe qui **relâche** le ballon (le ballon sort
  du rayon `POSSESSION_RADIUS_FACTOR × hauteur joueur`) ; quand il est de nouveau **contrôlé** par un
  joueur de la **même équipe** après avoir parcouru au moins
  `PASS_MIN_DIST_FACTOR × hauteur joueur`, c'est une passe complétée. Un
  contrôle par l'adversaire = interception (pas une passe) : une passe est
  donc toujours attribuée à une **seule** équipe, celle qui relâche et
  recontrôle. Les transitions (vol confirmé / re-contrôle) sont validées sur
  `POSSESSION_HOLD` frames : une fluctuation d'un seul frame du « joueur le
  plus proche » ne crée plus de passe fantôme.
- **Tirs / cadrés** : un tir est très **conservateur** (haute précision,
  rappel limité) car le « but » n'est pas calibré : on l'estime au bord de
  l'image. Les « lignes de but » étant en réalité les bords de l'écran, tout
  ballon rapide filant vers un bord — donc **toute passe en profondeur ou
  dégagement vers l'avant** — était compté comme tir (faux positifs en série).
  Le ballon est désormais un « tir » seulement si, **au moment de la frappe**,
  il est (1) dans la **zone du but visé** — à moins de
  `SHOT_GOAL_ZONE_FRACTION` de la largeur du terrain du bord attaqué — et
  (2) sa vitesse normalisée (`SHOT_SPEED_RATIO` × hauteur joueur) le mène à la
  ligne de but sous ~4 s, **et** (3) il **POURSUIT sa course** (déplacement net
  projeté sur la direction du saut ≥ 1,5× le saut — écarte une détection qui
  saute puis revient, net ≈ 0). Le saut admissible est borné à
  `SHOT_MAX_STEP_FACTOR × hauteur joueur`. *Cadré* si le point d'impact est
  dans l'ouverture du but (≈ 4,1 × hauteur joueur) ; un dépassement franc de la
  ligne est signalé comme **but probable**. En clair : mieux vaut **rater un
  tir réel que d'en inventer un**.
- **Buts (arrivée du ballon)** : le détecteur de tirs ci-dessus exige de voir
  la **frappe** — il rate les buts dont la frappe échappe à la détection (ballon
  masqué, tête, ballon déjà dans la surface, détection perdue au moment
  crucial). On détecte donc **aussi** un « but probable » par l'**arrivée** :
  si le ballon atteint l'extrémité du terrain (le but) à vitesse suffisante
  (`GOAL_ARRIVAL_MIN_SPEED_FACTOR × hauteur joueur`, mesurée sur
  `GOAL_ARRIVAL_WINDOW` frames) et dans l'ouverture du but
  (`GOAL_OPENING_FACTOR × hauteur joueur`), dans les `GOAL_REACH_FRACTION`
  extrêmes de la largeur du terrain, il est retenu. Un but d'arrivée **proche**
  d'un tir déjà détecté **promeut** ce tir en « but » (pas de doublon) ; sinon
  il est ajouté à la timeline. Comme le tir, c'est une heuristique mono-caméra
  (affiché « 🎯 But probable ») : les ballons finissant vite dans un coin
  peuvent être surfacés à tort — mieux vaut un léger sur-signalement qu'un but
  manqué.

> Ces métriques sont des heuristiques mono-caméra non calibrées : la
> qualité dépend fortement de l'angle de prise de vue (grand-angle
> pleine largeur recommandé). Elles sont conçues pour être « assez
> justes pour un rapport de match » et jamais présentées comme exactes.