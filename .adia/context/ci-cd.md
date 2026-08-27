# CI/CD — Benchrs
> Genere par @init_project le 2026-08-24 — Projet Benchrs
> Derniere mise a jour : 2026-08-27 (reconciliation fiche-joueur-composition)

## Pipeline GitHub Actions (`.github/workflows/ci.yml`)
- **Declencheurs** : push sur main/production, pull requests
- **Node** : 22
- **Jobs** :
  1. `lint-and-build` — *Lint + Typecheck + Build* : `npm ci` → `npx tsc --noEmit` → `npm run lint` → `npm run build`
  2. `e2e` — *Tests E2E (Playwright)* : `npm ci` → `npx playwright install --with-deps chromium` → `npx playwright test`
  3. `legacy-parity` — *Parite fork legacy* — **NOUVEAU (2026-08-27), BLOQUANT**
  4. `legacy-build` — *Build fork legacy* — **NOUVEAU (2026-08-27)**
- **Artifacts** : playwright-report (7 jours, en cas d'echec)

### Job `legacy-parity` (bloquant) ⚠️
> Verifie que `legacy-app/src/` est strictement identique a `src/`, hors allowlist declaree dans `scripts/check-legacy-parity.mjs`.

- `timeout-minutes: 5`, **pas de `npm ci`** — le script est du Node pur (`node:fs` / `path` / `crypto`), sans dependance
- Commande : `npm run check:legacy-parity` (= `node scripts/check-legacy-parity.mjs`)
- En cas d'echec, le job affiche l'aide : lancer **`npm run sync:legacy`** puis committer le resultat ; si l'ecart est intentionnel, le declarer dans l'allowlist de `scripts/check-legacy-parity.mjs`
- **Consequence pratique** : toute PR qui touche `src/` sans synchroniser `legacy-app/src/` est bloquee

### Job `legacy-build`
- Fork `legacy-app/` (Next 14 / React 18 / Tailwind 3), `working-directory: legacy-app`, `timeout-minutes: 20`
- `npm ci` → typecheck legacy `npx tsc --noEmit` (**non bloquant**) → `npm run build`

### Configuration liee
- `tsconfig.json` : `types: ["vitest/globals", "node"]` (rend le typecheck vert avec les globals Vitest)
- `eslint.config.mjs` : ignore `legacy-app/**` (le lint est recentre sur l'app principale)

## Deploiement Vercel
- **Branches** : main → Preview, production → Production
- **Build** : `npm run vercel-build` (= `next build`)
- **Crons Vercel** (`vercel.json`) — **2 crons orphelins supprimes le 2026-08-27** :
  - `GET /api/notifications/cron` — 20h00 UTC (notifications + rappels) — **seul cron restant**
  - ~~`GET /api/sporteasy/ical-cron` — 06h00 UTC~~ (supprime : route inexistante)
  - ~~`GET /api/motm/open` — 22h30 UTC dimanche~~ (supprime : route inexistante)
  - Meme nettoyage applique a `legacy-app/vercel.json` ; verrouille par `src/__tests__/legacy/vercel-crons.test.ts`

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
