# CI/CD — Benchrs
> Genere par @init_project le 2026-08-24 — Projet Benchrs
> Derniere mise a jour : 2026-08-24

## Pipeline GitHub Actions (`.github/workflows/ci.yml`)
- **Declencheurs** : push sur main/production, pull requests
- **Jobs** :
  1. `lint-and-build` : npm ci → tsc --noEmit → eslint → next build
  2. `e2e` : npm ci → playwright install chromium → playwright test
- **Node** : 22
- **Artifacts** : playwright-report (7 jours, en cas d'echec)

## Deploiement Vercel
- **Branches** : main → Preview, production → Production
- **Build** : `npm run vercel-build` (= `next build`)
- **Crons Vercel** (`vercel.json`) :
  - `GET /api/sporteasy/ical-cron` — 06h00 UTC (sync calendrier)
  - `GET /api/notifications/cron` — 20h00 UTC (notifications + rappels)
  - `GET /api/motm/open` — 22h30 UTC dimanche (vote homme du match)

## Secrets CI (GitHub Actions)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `MISTRAL_API_KEY`

## Environnements Vercel
- Variables d'env configurees dans le dashboard Vercel
- Pas de Docker, pas de Kubernetes
- Serverless (Vercel Functions)

## Supabase
- Migrations SQL dans `supabase/migrations/` (74 fichiers)
- Config : `supabase/config.toml`
- Gestion via Supabase CLI (`supabase db push`)
