# Fragment — events-matches
> Genere par @init_project le 2026-08-24
> Derniere mise a jour : 2026-08-24
> Module path : src/app/(dashboard)/matches/ + src/app/api/matches/

## Responsabilite
Gestion des matchs : detail, convocations, stats, lineups, score live, rapports IA, disponibilite.

## Fichiers cles
| Fichier | Role |
|---------|------|
| (dashboard)/matches/[id]/page.tsx | Page detail match (25 commits — hot zone) |
| api/matches/report/route.ts | POST — generation rapport de match IA (Mistral) |
| api/matches/live-token/route.ts | POST — genere un token pour le score live public |
| api/matches/availability/notify/route.ts | POST — notifie les joueurs de la dispo |
| components/ConvocationsDialog.tsx | Dialog coach : gestion convocations + envoi push |
| components/LiveMatchTracker.tsx | Score live realtime |
| components/EventDetail.tsx | Detail generique d'un event |
| components/EventCoachActions.tsx | Actions coach sur un event |

## Lien avec les notifications
- `ConvocationsDialog` appelle `authFetch("/api/notifications/send")` avec type "convocation"
- Le cron cree les rappels J-1 pour les events du lendemain
- Les relances auto ciblent les attendances en status "pending"
- `convocations_sent_at` est mis a jour sur l'event lors de l'envoi

## Points d'attention
- Le match live utilise Supabase Realtime (subscribe sur events)
- La page match est la plus modifiee du dashboard (25 commits)
