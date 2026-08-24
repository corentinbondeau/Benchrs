# Onboarding — Benchrs
> Genere par @init_project le 2026-08-24 — Projet Benchrs

## A lire en premier
1. `src/app/(dashboard)/layout.tsx` — architecture du dashboard (AuthProvider → TeamProvider → Guards)
2. `src/lib/supabase/admin.ts` — comment le serveur accede a la DB (bypass RLS)
3. `src/app/api/notifications/cron/route.ts` — le plus gros fichier backend (824 lignes), coeur du systeme de notifications
4. `src/app/api/notifications/send/route.ts` — envoi manuel de notifications (convocations)
5. `src/types/index.ts` — tous les modeles TypeScript du domaine

## Architecture en 30 secondes
Benchrs est une PWA Next.js 16 (App Router) qui sert d'outil de gestion pour clubs de football amateur. Le frontend est SSR/CSR avec React 19, la DB est Supabase (PostgreSQL + Auth + Realtime + Storage). Les API routes Next.js (49 endpoints) sont le "backend" — elles utilisent `createAdminClient` (Supabase service role) pour bypass le RLS. Les notifications push passent par la lib `web-push` (VAPID). Mistral AI genere les fiches d'entrainement, rapports et bilans.

## Lancer en local
```bash
npm install
cp .env.example .env.local   # remplir les variables Supabase + Mistral
npm run dev                   # http://localhost:3000
```

## Lancer les tests
```bash
npx playwright test
```

## Pieges courants
- Les cles VAPID sont hardcodees dans le code (`webpush.ts`, `push.ts`) — ne pas les remplacer par des env vars sans tester
- `SUPABASE_SERVICE_ROLE_KEY` invalide = toutes les API routes renvoient 401 silencieusement
- Le cron `/api/notifications/cron` fait 824 lignes et peut timeout (60s Vercel) sur un gros volume
- Tailwind CSS v4 : pas de `tailwind.config.js`, config dans `globals.css`
- Les types dans `src/types/index.ts` sont manuels (pas generes depuis Supabase)

## Qui contacter
- **Bondeau Corentin** — createur et seul contributeur (322 commits / 90 jours)

## Zones chaudes (fichiers les plus modifies)
- `src/components/layout/BottomNav.tsx` — navigation mobile, change a chaque nouvelle feature
- `src/app/(dashboard)/tactics/page.tsx` — page tactique en evolution rapide
- `src/app/api/notifications/cron/route.ts` — cron en enrichissement constant
- `src/types/index.ts` — nouveaux types a chaque feature
