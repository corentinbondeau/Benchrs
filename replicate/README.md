# Benchrs — Analyse vidéo via API ML externe (Replicate)

Le moteur d'analyse (`ai-service/`) est empaqueté en **modèle Cog** et
exposé comme une **API de vision pay-per-run** : plus aucun démon à
maintenir. Le front reste sur Vercel, qui appelle Replicate et reçoit le
résultat via webhook.

## Architecture

```
Coach → upload vidéo (Supabase Storage, bucket privé) → job 'pending'
   │
   ▼
Vercel POST /api/video-analysis/jobs
   └─ (REPLICATE_API_TOKEN configuré) → POST api.replicate.com/v1/models/…
                                          input: { video: <URL signée> }
                                          webhook: https://…/api/video-analysis/webhook
   ▼
Replicate calcule (CPU, ~centimes/vidéo) : YOLO + ByteTrack → JSON rapport
   ▼  webhook 'succeeded'/'failed'
Vercel /api/video-analysis/webhook → video_analyses completed + result
   ▼
Front /video-analysis (polling 20 s + realtime) → dashboard du rapport
```

## Déploiement du modèle (une seule fois)

1. **Créer le modèle** sur [replicate.com](https://replicate.com) →
   **New model** → nom `video-analysis` (ton compte = owner).
2. Ouvrir le modèle → **« Cog configuration »** → connecter ce dépôt
   GitHub et pointer le dossier **`replicate/`** → Replicate build
   l'image Docker (libgl + torch CPU + weights YOLO pré-chargés).
3. Après le build, le modèle est servi à
   `https://replicate.com/<owner>/video-analysis`.

## Variables d'environnement (Vercel → Project Settings → Env Vars)

| Variable | Valeur |
|---|---|
| `REPLICATE_API_TOKEN` | token API Replicate (Dashboard → API tokens) |
| `REPLICATE_MODEL` (optionnel) | défaut `benchrs/video-analysis` (ou `<owner>/video-analysis`) |

Ajoute aussi le cron de filet de sécurité dans `vercel.json`
(`/api/video-analysis/cron`, déjà présent) : il relance les `pending`
jamais envoyés et synchronise les prédictions orphelines (webhook perdu).
Ce cron exige `CRON_SECRET` (déjà utilisé par notifications).

## Notes

- Coût CPU Replicate ≈ 0,0001 $/s : une analyse de match (~10-30 min)
  revient à quelques centimes. La run est bornée par `MAX_FRAMES` /
  `HARD_TIMEOUT_SEC` (`ai-service/config.py`, réglables via les vars).
- Si `REPLICATE_API_TOKEN` est absent, les jobs restent `pending` : le
  worker self-host (`ai-service/python worker.py`) peut consommer la
  file — **les deux modes ne sont pas faits pour tourner en même temps.**
- Sans webhook secret : la liaison se fait par `external_id` (gravé au
  moment de la création par nos soins) → une prédiction tierce ne peut
  pas écrire sur nos jobs. Ajout possible : le champ `webhook_secret`
  Replicate (+ vérification du header) si besoin.