---
name: benchrs-local-setup
description: Demarrer Benchrs en local
generated_by: init_project
generated_at: 2026-08-24
project: benchrs
---

## Objectif
Installer et lancer Benchrs en local pour le developpement.

## Procedure
1. Cloner et installer :
   ```bash
   git clone git@github.com:corentinbondeau/Benchrs.git
   cd Benchrs
   npm install
   ```
2. Configurer les variables d'environnement dans `.env.local` :
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
   SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
   MISTRAL_API_KEY=<mistral-api-key>
   CRON_SECRET=<secret-pour-auth-cron>
   SMTP_HOST=<smtp-host>
   SMTP_PORT=587
   SMTP_USER=<user>
   SMTP_PASS=<pass>
   ```
3. Lancer le dev server :
   ```bash
   npm run dev    # http://localhost:3000
   ```
4. Verifications :
   ```bash
   npx tsc --noEmit   # Typecheck
   npm run lint        # ESLint
   npm run build       # Build production
   ```

## Conventions
- Port 3000
- Supabase cloud (pas de Supabase local)
- Les cles VAPID push sont hardcodees (pas besoin de les configurer)
