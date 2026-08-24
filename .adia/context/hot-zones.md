# Hot Zones
> Genere par @init_project le 2026-08-24 — Projet Benchrs
> Derniere mise a jour : 2026-08-24 (regenere — reconciliation fix-auto-convocations)

## Fichiers les plus modifies (30 derniers jours)
| # | Fichier | Commits | Module |
|---|---------|---------|--------|
| 1 | src/components/layout/BottomNav.tsx | 39 | layout |
| 2 | src/components/layout/Sidebar.tsx | 38 | layout |
| 3 | AGENTS.md | 38 | doc |
| 4 | src/app/(dashboard)/tactics/page.tsx | 37 | tactics |
| 5 | src/app/(dashboard)/calendar/page.tsx | 33 | calendar |
| 6 | src/types/index.ts | 30 | types |
| 7 | src/app/(dashboard)/matches/[id]/page.tsx | 29 | events-matches |
| 8 | src/app/(dashboard)/championship/page.tsx | 24 | championship |
| 9 | src/app/(dashboard)/gallery/page.tsx | 23 | gallery |
| 10 | src/components/stats/PlayerProfile.tsx | 21 | stats |
| 11 | src/app/(dashboard)/trainings/[id]/page.tsx | 21 | trainings |
| 12 | src/app/(dashboard)/settings/team/page.tsx | 21 | settings |
| 13 | src/app/(dashboard)/physical/page.tsx | 21 | physical |
| 14 | src/app/(auth)/register/page.tsx | 20 | auth |
| 15 | src/app/api/notifications/cron/route.ts | 14 | notifications |
| 16 | src/components/layout/TopBar.tsx | 12 | layout |
| 17 | src/app/(dashboard)/trophies/page.tsx | 12 | trophies |
| 18 | src/app/(dashboard)/roster/page.tsx | 12 | roster |
| 19 | src/app/(dashboard)/chat/page.tsx | 12 | chat |

## Zones critiques — systeme notifications
- `src/app/api/notifications/cron/route.ts` (14 commits) — orchestrateur cron, fichier backend le plus modifie
- `src/lib/deliver-notifications.ts` — **NOUVEAU** : delivery engine (testee)
- `src/lib/auto-convocations.ts` — **NOUVEAU** : auto-convocation engine (testee)
- `src/app/api/notifications/send/route.ts` — envoi manuel des convocations
- `src/lib/convocations.ts` — creation des rows d'attendance
- `src/lib/webpush.ts` — configuration VAPID (cles en dur)

## Contributeur unique
- **Bondeau Corentin** : 376 commits (90 jours) — projet solo
