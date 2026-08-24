# Project — Benchrs
> Genere par @init_project le 2026-08-24 — Projet Benchrs
> Derniere mise a jour : 2026-08-24

- **Nom** : Benchrs (benchrs-app)
- **Repo** : git@github.com:corentinbondeau/Benchrs.git
- **Type** : PWA (Progressive Web App) — gestion de club de football amateur
- **Langages** : TypeScript, SQL (migrations Supabase)
- **Framework** : Next.js 16 (App Router) + React 19
- **Styling** : Tailwind CSS v4 + shadcn/ui + Framer Motion
- **Backend** : Supabase (PostgreSQL, Auth, RLS, Realtime, Storage)
- **IA** : Mistral API (annonces, defis, plans de saison, bilans, rapports de match)
- **Push** : Web Push (VAPID) via `web-push` + Service Worker (`sw.js`)
- **Email** : Nodemailer (SMTP) pour reset password
- **Crons** : Vercel Crons (3 jobs quotidiens : ical-sync 6h, notifs 20h, MOTM 22h30 dim)
- **Version** : 0.1.0 (privee)
- **Deploiement** : Vercel (branches main/staging/production)
- **Taille** : ~236 fichiers TS/TSX, 74 migrations SQL, 49 routes API
- **Contributeur principal** : Bondeau Corentin (projet solo)

## Fonctionnalites principales
- Gestion d'equipe : effectif, convocations, presences, stats
- Matchday : score live, lineups, check-in, checklist
- Entrainements : fiches IA, exercices, schemas tactiques
- Calendrier, messagerie, galerie, trophees
- Espace club multi-equipes (comite/president)
- Convocations auto + notifications push/email
- Parents : liaison enfant, onboarding, agenda multi-enfants
