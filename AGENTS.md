<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Sportplus — Agent Memory

## Objective
Build a mobile-first football team management app (Sportplus) with Supabase backend.

## Important Details
- Roster page links player cards to `/stats/[playerId]` (shows PlayerProfile component)
- Convocations: coach attendance status editing uses DropdownMenu with DropdownMenuItem (not controlled Select) to avoid base-ui controlled component bug; optimistic update with setEvents + fetchData for sync
- Chat page had duplicate views on desktop — fixed by wrapping mobile section in `md:hidden`
- Tactics: "Phase" select replaces free-text title (5 fixed options); not required; objectives are phase-specific checkbox multi-select (max 2) using `PHASE_OBJECTIVES` constant; objectives stored as array via `selectedObjectives` state
- FeuilletMatchTab: drag-and-drop system with formation selector (5 formations), pitch with position slots, bench (5 slots), players from attendances (`status="present"`), save to `formations` table, load existing formation on event select; click on slot opens dialog to pick player
- `createClient()` called inline (no useMemo) — acceptable pattern
- "Tous les joueurs" per-team = `team_members` (role `player`) joined with `profiles`, filtered `is_active = true`; helper `fetchTeamActivePlayers(teamId)` in `src/lib/players.ts`
- Per-team roles: use `userRole` from `useTeam()`; UI coach-gating = `userRole === "coach" || userRole === "owner"` (NOT global `user?.profile?.role`)
- Push notifications: `src/lib/webpush.ts` (web-push, VAPID env fallbacks), `/api/notifications/send` (insert rows + send push; supports `scheduled_for`), `/api/notifications/cron` (GET, sends `scheduled_for <= now` & `delivered_at IS NULL`, marks delivered). `vercel.json` cron daily 20:00. Client key = `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
- Calendar CreateEventModal: auto-pre-selects ALL active players when opened; `convocation_lead_days` (default 3) schedules convocation notifications at `event_date - leadDays` via `/api/notifications/send`
- Convocations = lignes `attendances` créées UNIQUEMENT à l'envoi réel de la notification (pas à la création de l'événement) : helper `ensureAttendanceRows` dans `src/lib/convocations.ts`, appelé par `/api/notifications/send` (envoi immédiat) et le cron (envoi planifié). Le calendrier ne crée plus de lignes d'attendance en avance — une série récurrente ne convoque que les occurrences dont la fenêtre `event_date - leadDays` est atteinte. Migration `028` nettoie les anciennes convocations en avance.
- Live match push notifications: `LiveMatchTracker.notifyLive()` posts to `/api/notifications/send` (type `match_live`) pour les joueurs actifs de l'équipe (`players` prop) ET leurs parents (via `parent_student`) — buts (avec score), cartons, blessures, et phases Début/Mi-temps/2e mi-temps/Fin. `notifyLiveEvent()` construit le titre depuis l'événement ajouté. Les changements (substitutions) ne notifient pas.
- Event detail pages (`trainings/[id]`, `matches/[id]`) follow a two-part layout via shared components in `src/components/EventDetail.tsx`: Part 1 = `EventInfoCard` (Date, Rendez-vous `meeting_time`, Début, Lieu + `myPresence` response row for non-coach — player's own or parent's child via `getParentChildId`); Part 2 = `AttendanceLists` (Présents/Retards, Absents, Excusés, En attente with coach toggles). Header card keeps only title/badges/score/Convoquer (date/time/location moved out). `meeting_time` = `Event & { meeting_time: string | null }`; displayed via `slice(0,5)` (TIME column returns `HH:MM:SS`)
- NOTE (env): Vercel prod env values for Supabase/VAPID pulled as empty/11-char stubs — user says keys are good on Vercel; `.env.local` only holds VAPID fallback keys and is gitignored. Local `npm run build` fails on missing `NEXT_PUBLIC_SUPABASE_URL` (env artifact, not code). VAPID env naming: server reads `NEXT_PUBLIC_VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` + `VAPID_SUBJECT`; older prod vars `NEXT_PUBLIC_VAPID_KEY`/`VAPID_EMAIL` are unused by current code

## Completed
- Roster: linked player cards to `/stats/[playerId]`
- Convocations: added updateAttendanceStatus with optimistic update + DropdownMenu (plain onClick items)
- Chat: hid mobile view on desktop with `md:hidden` wrapper
- Tactics: replaced title Input with Phase Select (5 options, optional)
- Tactics: replaced free-text objectives with phase-specific checkbox multi-select (max 2)
- FeuilletMatchTab: rewritten to show only pitch + present players from attendances for selected match
- Seed script `insert_ecc_u14.sql` created (14 players for ECC U14)
- Cleaned up unused types (`Formation`, `MatchLineup`) and `FORMATION_POSITIONS` constant from tactics page
- Fixed type error in FeuilletMatchTab Profile cast (`as unknown as Profile | null`)
- FeuilletMatchTab: drag-and-drop system with formation selector, pitch slots, and bench
- Team-scoped active player counts (QuickStats + `src/lib/players.ts`)
- Redirect to Dashboard after team creation (create-team, register, Sidebar, BottomNav hard redirect + `localStorage.selectedTeamId`)
- "Convoquer" button + ConvocationsDialog on trainings/`[id]` and matches/`[id]` pages (team-scoped players, per-team role)
- Scheduled mass convocations from calendar (auto-select all, lead-days scheduling)
- Push notifications: real VAPID keypair (webpush.ts, sw.js, usePushNotifications), send + cron API routes, `notifications.scheduled_for`/`delivered_at` in migration 019
- Per-team roles refactored across 13+ files (attendance, stats, tasks, trophies, gallery, medical, championship, chat, settings, TopBar, PlayerProfile, tactics, physical, Sidebar, BottomNav)
- Migration `019_convocation_scheduling_and_profile_rls.sql`: `events.convocation_lead_days`, `notifications.scheduled_for`/`delivered_at`, profiles SELECT policy via `public.user_team_ids()`
- Event detail pages refactored to two-part layout (Informations + Présents/absents) via `src/components/EventDetail.tsx`; header simplified; moved guard `if (!currentTeam)` AFTER hooks in both pages (fixed 21 pre-existing rules-of-hooks errors)
- `src/components/EventCoachActions.tsx`: coach actions on event pages — Reporter (single event, notif aux convoqués), Modifier, Annuler/Réactiver (notif aux convoqués), Supprimer (AUCUNE notif, redirect /calendar). Récurrences: colonne `events.recurrence_group_id` (migration 023), posée par le calendrier via `crypto.randomUUID()` quand >1 occurrence; si l'événement fait partie d'un groupe, Modifier/Annuler/Supprimer proposent un périmètre "Cet événement" vs "Toutes les occurrences (N)" (ScopeToggle); en périmètre "all", la date n'est pas modifiable (champ caché) et Annuler envoie une notif par occurrence. «Entrainement» = coquille UI historique — la valeur enum est `training`
