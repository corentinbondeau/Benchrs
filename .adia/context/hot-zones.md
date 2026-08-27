# Hot Zones
> Genere par @init_project le 2026-08-24 — Projet Benchrs
> Derniere mise a jour : 2026-08-27 (regenere — reconciliation fiche-joueur-composition)

## Fichiers les plus modifies (30 derniers jours)
> Regenere via `git log --since="30 days ago" --name-only --pretty=format:` (fichiers `legacy-app/**` exclus : ce sont des copies miroir de `src/`).

| # | Fichier | Commits | Module | Evolution |
|---|---------|---------|--------|-----------|
| 1 | src/components/layout/BottomNav.tsx | 41 | layout | = |
| 2 | src/components/layout/Sidebar.tsx | 40 | layout | = |
| 3 | AGENTS.md | 40 | doc | = |
| 4 | src/app/(dashboard)/tactics/page.tsx | 39 | tactics | = |
| 5 | src/app/(dashboard)/calendar/page.tsx | 35 | calendar | = |
| 6 | src/app/(dashboard)/matches/[id]/page.tsx | 31 | events-matches | ^ +2 (7 -> 6) |
| 7 | src/types/index.ts | 30 | types | v (6 -> 7) |
| 8 | src/components/stats/PlayerProfile.tsx | 24 | components-stats | ^ +1 (9 -> 8) |
| 9 | src/app/(dashboard)/championship/page.tsx | 24 | championship | v |
| 10 | src/app/(dashboard)/gallery/page.tsx | 23 | gallery | = |
| 11 | src/app/(dashboard)/settings/team/page.tsx | 22 | settings | = |
| 12 | src/app/(dashboard)/trainings/[id]/page.tsx | 21 | trainings | = |
| 13 | src/app/(dashboard)/physical/page.tsx | 21 | physical | = |
| 14 | src/app/(auth)/register/page.tsx | 17 | auth | = |
| 15 | src/app/api/notifications/cron/route.ts | 15 | notifications | = |
| 16 | src/components/layout/TopBar.tsx | 14 | layout | = |
| 17 | src/app/(dashboard)/roster/page.tsx | 14 | roster | = |
| 18 | src/components/training/SessionFiche.tsx | 13 | trainings | = |
| 19 | src/app/(dashboard)/trophies/page.tsx | 12 | trophies | = |
| 20 | src/app/(dashboard)/chat/page.tsx | 12 | chat | = |
| 21 | package.json | 12 | infra | nouveau dans le top 20 |
| 22 | src/app/(dashboard)/settings/page.tsx | 11 | settings | nouveau dans le top 20 |
| 23 | src/app/(dashboard)/admin/cotisations/page.tsx | 11 | admin | nouveau dans le top 20 |

## Zones critiques — composition d'equipe (fiche-joueur-composition, 2026-08-27)
Le domaine "composition" est desormais **eclate en 3 couches**. Toute evolution doit respecter ce decoupage, verrouille par des tests.

- `src/lib/lineup/` — **NOUVEAU**, noyau pur teste (positions, formations, autoCompose, toMatchLineups). Point de verite du vocabulaire de postes et des regles d'affectation.
- `src/components/lineup/LineupEditor.tsx` — **NOUVEAU** (686 l.), SEUL editeur de compo de l'app, 2 appelants.
- `src/app/(dashboard)/tactics/FeuilletMatchTab.tsx` — reduit de 705 a **54 l.** ; ⚠️ chemin **fige** par `src/__tests__/pages/tactics-split.test.ts`.
- `src/app/(dashboard)/matches/[id]/page.tsx` (31 commits, hot zone #6) — carte « Composition » editable coach + carte read-only pour les autres roles.
- `src/components/stats/PlayerProfile.tsx` (24 commits, hot zone #8) — edition inline des attributs joueur ; ⛔ ne jamais envoyer `role` dans l'update `profiles`.
- `src/types/index.ts` (30 commits, hot zone #7) — `FormationData` unifie ; toute nouvelle cle doit rester optionnelle.
- **Deux representations** : `formations.formation_data` = source riche · `match_lineups` = projection reconstruite (DELETE+INSERT via `toMatchLineupRows`). Ne jamais editer `match_lineups` directement.

## Zone critique — parite avec le fork legacy-app (2026-08-27)
> ⚠️ **Toute modification de `src/` doit etre repercutee dans `legacy-app/src/` via `npm run sync:legacy`.** Sans cela, le job CI **`legacy-parity` (bloquant)** echoue et la PR ne peut pas etre mergee.

- `scripts/check-legacy-parity.mjs` — comparateur d'arbres (`npm run check:legacy-parity`)
- `scripts/sync-legacy.sh` — replication `src/` -> `legacy-app/src/` (`npm run sync:legacy`)
- `src/__tests__/legacy/parity.test.ts`, `src/__tests__/legacy/vercel-crons.test.ts`
- `legacy-app/**` est ignore par ESLint (`eslint.config.mjs`) et exclu du comptage des hot zones.

## Zones critiques — assiduite / stats (fix-assiduite-training-only)
La regle metier "assiduite = entrainements uniquement" est repartie sur plusieurs points de calcul. Toute modif touchant l'assiduite DOIT passer par le helper central `src/lib/attendance/computeAttendanceRate.ts` et le pattern 2-requetes (events type='training' -> trainingIds -> attendances filtrees).
- `src/lib/attendance/computeAttendanceRate.ts` — **NOUVEAU** : point de verite unique (teste)
- `src/lib/season/stats.ts` — attendanceRate restreint aux entrainements (teste)
- `src/lib/seasonReport.ts` — attendancePct sur entrainements (etait sur les matchs) (teste)
- `src/components/stats/PersonalGoalsCard.tsx` — objectif assiduite
- `src/components/stats/PlayerBadgesCard.tsx` — badge "Assidu" + bestStreak
- `src/app/(dashboard)/stats/drop/page.tsx` — "6 derniers entrainements"
- `src/components/stats/CoachStats.tsx` — breakdown par type, **hors perimetre** (ne pas "corriger" par erreur)

## Zones critiques — systeme notifications
- `src/app/api/notifications/cron/route.ts` (15 commits) — orchestrateur cron, fichier backend le plus modifie
- `src/lib/deliver-notifications.ts` — delivery engine (testee)
- `src/lib/auto-convocations.ts` — auto-convocation engine (testee)
- `src/app/api/notifications/send/route.ts` — envoi manuel des convocations
- `src/lib/convocations.ts` — creation des rows d'attendance
- `src/lib/webpush.ts` — configuration VAPID (cles en dur)

## Contributeur unique
- **Bondeau Corentin** : projet solo
