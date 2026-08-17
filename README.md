# Benchrs

> La plateforme tout-en-un de gestion d'equipe de football amateur.

Benchrs est une **Progressive Web App** (PWA) qui centralise la gestion complete d'un club de football amateur : calendrier, statistiques, communication, administration, et bien plus.

## Fonctionnalites principales

- **Calendrier** — Matchs, entrainements, evenements avec export ICS
- **Statistiques** — Buts, passes, notations, temps de jeu, comparaison de joueurs
- **Communication** — Chat temps reel, notifications push, annonces automatisees par IA
- **Gestion d'equipe** — Effectif, convocations, presences, covoiturage
- **Preparation physique** — Suivi VMA/VMI, fiches d'entrainement generees par IA, defis hebdomadaires
- **Administration** — Cotisations, tresorerie, licences, certificats medicaux, inventaire materiel
- **Club** — Gestion multi-equipes, comite, terrains, club house, transferts inter-equipes
- **Score live** — Suivi de match en temps reel partageable par lien
- **Galerie** — Photos et videos organisees par albums
- **IA** — Generation de fiches d'entrainement, bilans de saison, newsletters, voeux personnalises (Mistral AI)
- **Page publique** — Vitrine du club avec formulaire de demande d'essai

## Stack technique

| Couche | Technologie |
|--------|-------------|
| Frontend | [Next.js 16](https://nextjs.org/) (App Router, React 19, TypeScript) |
| Styling | [Tailwind CSS v4](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/) |
| Backend / BDD | [Supabase](https://supabase.com/) (PostgreSQL + RLS + Realtime + Auth + Storage) |
| IA | [Mistral AI](https://mistral.ai/) (generation de contenu) |
| PDF | [@react-pdf/renderer](https://react-pdf.org/) |
| Charts | [Recharts](https://recharts.org/) |
| Notifications | Web Push + [nodemailer](https://nodemailer.com/) |
| Tests | [Playwright](https://playwright.dev/) (E2E) |
| CI/CD | [GitHub Actions](https://github.com/features/actions) |
| Deploiement | [Vercel](https://vercel.com/) |

## Demarrage rapide

### Prerequis

- Node.js >= 20.9.0
- npm
- Compte [Supabase](https://supabase.com/) (projet cree)

### Installation

```bash
# Cloner le repo
git clone git@github.com:corentinbondeau/Benchrs.git
cd Benchrs

# Installer les dependances
npm install

# Configurer les variables d'environnement
cp .env.example .env.local
# Renseigner les cles Supabase, NextAuth, Mistral, etc.

# Lancer en dev
npm run dev
```

L'application sera accessible sur [http://localhost:3000](http://localhost:3000).

### Variables d'environnement

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | URL du projet Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Cle anonyme Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Cle service role Supabase (serveur uniquement) |
| `NEXTAUTH_SECRET` | Secret NextAuth.js |
| `NEXTAUTH_URL` | URL de l'application |
| `MISTRAL_API_KEY` | Cle API Mistral (fonctionnalites IA) |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Cles VAPID pour Web Push |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | Configuration SMTP pour l'envoi d'emails |
| `CRON_SECRET` | Secret pour les endpoints cron Vercel |

## Scripts

| Commande | Description |
|----------|-------------|
| `npm run dev` | Serveur de developpement |
| `npm run build` | Build de production |
| `npm run start` | Serveur de production |
| `npm run lint` | Linting ESLint |
| `npx tsc --noEmit` | Verification des types TypeScript |
| `npx playwright test` | Lancer les tests E2E |

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture](docs/ARCHITECTURE.md) | Architecture technique detaillee |
| [API](docs/API.md) | Documentation des 59 endpoints |
| [Base de donnees](docs/DATABASE.md) | Schema, tables, RLS, migrations |
| [Deploiement](docs/DEPLOYMENT.md) | Vercel, Docker, Kubernetes |
| [Tests](docs/TESTING.md) | Strategie de tests et guide E2E |
| [Fonctionnalites](docs/FEATURES.md) | Guide fonctionnel complet |
| [Contribution](CONTRIBUTING.md) | Guide de contribution |

## Licence

Ce projet est prive. Tous droits reserves.
