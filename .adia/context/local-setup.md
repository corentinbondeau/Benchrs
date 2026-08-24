# Local Setup — Benchrs
> Genere par @init_project le 2026-08-24 — Projet Benchrs
> Derniere mise a jour : 2026-08-24

## Prerequis
- Node.js >= 20 (recommande 22)
- npm
- Compte Supabase (projet configure)

## Installation
```bash
git clone git@github.com:corentinbondeau/Benchrs.git
cd Benchrs
npm install
```

## Variables d'environnement requises
Creer `.env.local` a la racine :
```
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
MISTRAL_API_KEY=<mistral-api-key>
CRON_SECRET=<secret-pour-auth-cron>
SMTP_HOST=<smtp-host>
SMTP_PORT=587
SMTP_USER=<smtp-user>
SMTP_PASS=<smtp-pass>
```

## Demarrage
```bash
npm run dev          # Dev server Next.js (port 3000)
npm run build        # Build production
npm run start        # Start production
npm run lint         # ESLint
npx tsc --noEmit     # Typecheck
```

## Tests
```bash
npx playwright test                    # E2E complets
npx playwright test --project=chromium # Desktop uniquement
```

## Migrations Supabase
```bash
supabase db push    # Appliquer les migrations
```

## Ports
- 3000 : Next.js dev/prod
