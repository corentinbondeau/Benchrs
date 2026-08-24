# Dependencies — Benchrs
> Genere par @init_project le 2026-08-24 — Projet Benchrs
> Derniere mise a jour : 2026-08-24 (reconciliation fix-auto-convocations)

## Gestionnaire de paquets
- **npm** (lockfile : `package-lock.json`)
- Node >= 22 (CI)

## Dependances critiques
| Package | Version | Role |
|---------|---------|------|
| next | 16.2.10 | Framework SSR/SSG, App Router |
| react / react-dom | 19.2.4 | UI rendering |
| @supabase/supabase-js | ^2.110.7 | Client Supabase (DB, Auth, Realtime) |
| @supabase/ssr | ^0.12.3 | SSR helpers pour Supabase |
| web-push | ^3.6.7 | Push notifications VAPID serveur |
| nodemailer | ^7.0.13 | Envoi d'emails SMTP |
| tailwindcss | ^4 | Styling utility-first |
| shadcn | ^4.13.1 | Composants UI |
| framer-motion | ^12.42.2 | Animations |
| date-fns | ^4.4.0 | Manipulation de dates |
| recharts | ^3.9.2 | Graphiques/stats |
| @react-pdf/renderer | ^4.5.1 | Generation PDF (fiches, bilans) |
| node-ical | ^0.27.0 | Parsing ICS/webcal |
| sonner | ^2.0.7 | Toasts notifications |

## Dev dependencies
| Package | Role |
|---------|------|
| vitest | ^4.1.11 | Tests unitaires |
| @vitest/coverage-v8 | ^4.1.11 | Coverage provider V8 |
| @playwright/test | Tests E2E |
| eslint + eslint-config-next | Linting |
| typescript ^5 | Typage |

## Libs partagees / internes
- Aucune dependance interne (`git+ssh://`, `file:`, etc.)

## API externe
- **Mistral AI** : generation IA (annonces, rapports, plans, defis)
- **Open-Meteo** : meteo (CSP autorise, pas de cle API)
- **Nominatim** : geocoding (CSP autorise, pas de cle API)
- **FFF** : scraping classements championnat (via api/championships/fff)
