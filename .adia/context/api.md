# API — Benchrs
> Genere par @init_project le 2026-08-24 — Projet Benchrs
> Derniere mise a jour : 2026-08-24

## Architecture
- Next.js API Routes (App Router) dans `src/app/api/`
- 49 routes au total
- Auth : Bearer JWT token (Supabase) via `getAuthUser(req)` / `getAuthUserDetailed(req)`
- Rate limiting in-memory sur les endpoints sensibles

## Routes par domaine

### Notifications (critique)
| Method | Path | Auth | Role |
|--------|------|------|------|
| GET | /api/notifications/cron | CRON_SECRET | Cron delivery + rappels + digest |
| POST | /api/notifications/send | Bearer | Envoi manuel (coach ou message) |
| POST | /api/notifications/subscribe | Bearer | Souscription push |
| DELETE | /api/notifications/subscribe | Bearer | Desabonnement push |

### Auth
| POST | /api/auth/register | - | Inscription |
| POST | /api/auth/join-team | Bearer | Rejoindre equipe |
| POST | /api/auth/join-club | Bearer | Rejoindre club |
| POST | /api/auth/create-team | Bearer | Creer equipe |
| POST | /api/auth/link-child | Bearer | Lier parent/enfant |
| POST | /api/auth/forgot-password | - | Reset password (email) |

### Matchs
| POST | /api/matches/report | Bearer | Rapport IA |
| POST | /api/matches/live-token | Bearer | Token score live |
| POST | /api/matches/availability/notify | Bearer | Notif dispo |

### Entrainements
| POST | /api/trainings/generate | Bearer | Fiche IA |
| GET | /api/trainings/pdf | Bearer | Export PDF |

### Saison
| POST | /api/season/report | Bearer | Bilan saison IA |
| GET | /api/season/report/pdf | Bearer | PDF bilan |
| POST | /api/season/plan | Bearer | Plan saison IA |
| POST | /api/season/storybook | Bearer | Storybook |
| POST | /api/season/greetings | Bearer | Voeux |
| POST | /api/season/copy | Bearer | Copie saison |

### Crons Vercel
| GET | /api/sporteasy/ical-cron | CRON_SECRET | Sync calendrier ICS (6h) |
| GET | /api/notifications/cron | CRON_SECRET | Notifications (20h) |
| GET | /api/motm/open | CRON_SECRET | Vote MOTM (dim 22h30) |
