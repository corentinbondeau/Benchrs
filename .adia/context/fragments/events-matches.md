# Fragment — events-matches
> Genere par @init_project le 2026-08-24
> Derniere mise a jour : 2026-08-27 (fiche-joueur-composition)
> Module path : src/app/(dashboard)/matches/ + src/app/api/matches/

## Responsabilite
Gestion des matchs : detail, convocations, stats, lineups, score live, rapports IA, disponibilite.

## Fichiers cles
| Fichier | Role |
|---------|------|
| (dashboard)/matches/[id]/page.tsx | Page detail match (31 commits — hot zone #6) |
| api/matches/report/route.ts | POST — generation rapport de match IA (Mistral) |
| api/matches/live-token/route.ts | POST — genere un token pour le score live public |
| api/matches/availability/notify/route.ts | POST — notifie les joueurs de la dispo |
| components/ConvocationsDialog.tsx | Dialog coach : gestion convocations + envoi push |
| components/LiveMatchTracker.tsx | Score live realtime |
| components/EventDetail.tsx | Detail generique d'un event |
| components/EventCoachActions.tsx | Actions coach sur un event |

## Carte « Composition » editable (2026-08-27, fiche-joueur-composition)
La carte « Composition » de `matches/[id]/page.tsx` est desormais **editable en place par un coach**, sans passer par l'onglet Tactiques.

- `isCoach` → rend `<LineupEditor showEventPicker={false} eventId={params.id} isCoach onSaved={...} />`
- autres roles (joueur, parent) → **carte read-only conservee** telle quelle, titre « Composition — {formation?.name} »
- `onSaved` declenche `reloadLineupData()` : re-fetch parallele de `formations` et de `match_lineups`
  (`select("*, profile:profiles!match_lineups_player_id_fkey(id, first_name, last_name, shirt_number, position)")`)
  afin que la carte read-only et les listes restent coherentes apres sauvegarde.
- Source de verite : `formations.formation_data` ; `match_lineups` en est une projection reconstruite (DELETE+INSERT) via `toMatchLineupRows`.
- Voir `fragments/components-lineup.md` et `fragments/lib-lineup.md`.

## Lien avec les notifications
- `ConvocationsDialog` appelle `authFetch("/api/notifications/send")` avec type "convocation"
- Le cron cree les rappels J-1 pour les events du lendemain
- Les relances auto ciblent les attendances en status "pending"
- `convocations_sent_at` est mis a jour sur l'event lors de l'envoi

## Points d'attention
- Le match live utilise Supabase Realtime (subscribe sur events)
- La page match est parmi les plus modifiees du dashboard (31 commits)
- L'edition de compo passe **exclusivement** par `LineupEditor` — ne pas dupliquer de logique de composition dans la page
- Modifications a synchroniser dans `legacy-app/src/` (`npm run sync:legacy`, job CI `legacy-parity` bloquant)
