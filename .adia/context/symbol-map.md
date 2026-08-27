# Symbol Map
> Genere par @init_project le 2026-08-24 — Projet Benchrs
> Derniere mise a jour : 2026-08-27 (reconciliation fiche-joueur-composition)

## src/lib/lineup/ — vocabulaire de postes, formations, composition (100% pur)

### positions.ts — source de verite unique des libelles de postes
- **POSITION_KEYS** (const, readonly tuple) -> `src/lib/lineup/positions.ts:11`
  - valeurs : `GK | DC | LD | LG | MD | MC | MO | AD | AG | BU`
- **PositionKey** (type) -> `src/lib/lineup/positions.ts:24` — `(typeof POSITION_KEYS)[number]`
- **POSITION_LABELS** (const) -> `src/lib/lineup/positions.ts:26`
  - `Record<PositionKey, string>` — libelles FR : Gardien, Defenseur central, Lateral droit, Lateral gauche, Milieu defensif, Milieu central, Milieu offensif, Ailier droit, Ailier gauche, Buteur
  - ⚠️ **PERSISTE EN BASE** dans `profiles.position` et `profiles.secondary_positions` — ne jamais modifier valeurs/ordre sans migration
- **POSITIONS** (const) -> `src/lib/lineup/positions.ts:40`
  - `string[]` derive de POSITION_KEYS/POSITION_LABELS, dans l'ordre historique de settings
- **labelToKey** (function, pure) -> `src/lib/lineup/positions.ts:47`
  - params: `(label: string | null | undefined)` → returns `PositionKey | null`
  - table inverse derivee de POSITION_LABELS (une seule declaration a maintenir)
- **POSITION_FAMILY** (const) -> `src/lib/lineup/positions.ts:55`
  - `Record<PositionKey, "GK" | "DEF" | "MID" | "ATT">` — regroupement macro pour classification/reporting
  - ⚠️ **PAS** utilise par `autoCompose` (aucun repli par famille)
- tests : `src/lib/lineup/positions.test.ts`

### formations.ts
- **SlotPos** (interface) -> `src/lib/lineup/formations.ts:14` — `{ x, y, label, role: PositionKey }`
- **FORMATIONS** (const) -> `src/lib/lineup/formations.ts:21`
  - `Record<string, SlotPos[]>` — **9 formations x 11 slots** : `4-3-3`, `4-4-2`, `3-5-2`, `3-4-3`, `4-2-2-2`, `4-1-4-1`, `5-4-1`, `4-2-3-1`, `5-3-2`
  - deplacee depuis `FeuilletMatchTab.tsx` ; `label/x/y` strictement identiques a l'origine (persistes dans `formations.formation_data`), `role` purement additif
  - ⚠️ desambiguisation "Milieu D" : milieu **defensif** (`MD`) en 4-2-2-2 / 4-1-4-1 / 4-2-3-1 ; **couloir** (`AD`/`AG`) en 3-4-3 / 5-4-1
- tests : `src/lib/lineup/formations.test.ts`

### autoCompose.ts — composition automatique par postes
- **ComposablePlayer** (interface) -> `src/lib/lineup/autoCompose.ts:24` — `{ id, position?, secondary_positions? }`
- **ComposableSlot** (interface) -> `src/lib/lineup/autoCompose.ts:30` — `{ role: PositionKey }`
- **AutoComposeInput** (interface) -> `src/lib/lineup/autoCompose.ts:34` — `{ slots, players, benchSize }`
- **AutoComposeResult** (interface) -> `src/lib/lineup/autoCompose.ts:40` — `{ assignments: Record<string,string>, bench: Record<string,string>, unassigned: string[] }`
- **autoCompose** (function, pure) -> `src/lib/lineup/autoCompose.ts:57`
  - **REGLES** : (1) le slot `GK` est resolu en priorite absolue ; (2) score 2 = poste principal, 1 = poste secondaire, joueur non candidat sinon (aucun repli par famille) ; (3) egalite departagee par `id` croissant (deterministe) ; (4) slot sans candidat eligible = **slot laisse vide** (pas de cle `slot-i`) ; (5) non-titulaires au banc dans la limite de `benchSize`, surplus dans `unassigned`
  - `preferred_foot` est structurellement absent de `ComposablePlayer` → ne peut pas influencer le resultat (verrou teste)
  - pure, sans I/O — tests : `src/lib/lineup/autoCompose.test.ts`

### toMatchLineups.ts — projection vers la table `match_lineups`
- **MatchLineupRow** (interface) -> `src/lib/lineup/toMatchLineups.ts:3`
  - `{ event_id, player_id, position_label: string | null, is_starter: boolean, team_id }`
- **toMatchLineupRows** (function, pure) -> `src/lib/lineup/toMatchLineups.ts:23`
  - params: `(formationData: FormationData, eventId: string, teamId: string)` → returns `MatchLineupRow[]`
  - projette `formations.formation_data` (source riche) en lignes `match_lineups` (projection denormalisee, reconstruite par DELETE+INSERT)
  - **INVARIANTS** : slots/places de banc a `player_id` null filtres (NOT NULL en base) ; `team_id` sur CHAQUE ligne (verrou anti-RLS) ; jamais deux fois le meme `player_id` (pas de contrainte UNIQUE en base) ; titulaires `is_starter: true` avec `position_label`, banc `is_starter: false` avec `position_label: null`
  - tests : `src/lib/lineup/toMatchLineups.test.ts`

### src/lib/positions.ts (module historique)
- **POSITIONS** (re-export) -> `src/lib/positions.ts:5` — `export { POSITIONS } from "./lineup/positions"`
  - ne contient plus AUCUNE declaration propre ; conserve pour ses consommateurs (settings/page.tsx, PlayerProfile.tsx)

## src/lib/profile/
- **BuildProfileAttributesInput** (type) -> `src/lib/profile/buildProfileAttributesPayload.ts:3`
  - `{ preferredFoot?, position?, secondaryPositions? }`
- **ProfileAttributesPayload** (type) -> `src/lib/profile/buildProfileAttributesPayload.ts:9`
  - `{ preferred_foot: "Droit" | "Gauche" | "Ambidextre" | null, secondary_positions: string[] }`
- **buildProfileAttributesPayload** (function, pure) -> `src/lib/profile/buildProfileAttributesPayload.ts:47`
  - normalise le pied fort (hors liste → `null`) et les postes secondaires (filtre sur `POSITIONS`, retire le poste principal, dedoublonne, preserve l'ordre)
  - ⛔ **la cle `role` ne doit JAMAIS apparaitre dans le payload** : le trigger SQL `prevent_self_role_change` (`072_security_fixes.sql:49-66`) leve une exception sur tout update contenant `role`, y compris pour un coach
  - tests : `src/lib/profile/buildProfileAttributesPayload.test.ts`

## src/components/lineup/
- **LineupEditor** (component, client) -> `src/components/lineup/LineupEditor.tsx:56`
  - **SEUL point d'edition d'une composition** dans l'app (686 l.)
  - charge/persiste `formations`, projette vers `match_lineups` via `toMatchLineupRows`, propose la composition auto via `autoCompose`
  - banc : `BENCH_SLOTS = ["R1".."R5"]`
- **LineupEditorProps** (interface) -> `src/components/lineup/LineupEditor.tsx:37`
  - `{ eventId: string | null, teamId: string, userId: string | null, isCoach: boolean, showEventPicker?: boolean, events?: MatchEventOption[], onEventChange?: (id) => void, onSaved?: (formation: Formation) => void }`
  - `showEventPicker: true` (defaut) = onglet Tactiques (select interne) · `false` = fiche match (`params.id`)
- **MatchEventOption** (type) -> `src/components/lineup/LineupEditor.tsx:35` — alias de `Event`
- **PitchSVG** (component) -> `src/components/lineup/PitchSVG.tsx:1` — fond de terrain SVG, sans props

## src/lib/attendance/
- **computeAttendanceRate** (function, pure) -> `src/lib/attendance/computeAttendanceRate.ts:12`
  - params: (attendances: {event_id, status}[], eventIds: string[])
  - returns: number | null — taux d'assiduite 0-100, `null` si aucune attendance ne matche `eventIds`
  - **REGLE METIER** : l'assiduite ne compte QUE la presence aux entrainements. Appeler avec `eventIds` = ids des events type='training'. "present" = status "present" | "late"
  - pure, sans I/O — testee (7 tests) : `src/lib/attendance/computeAttendanceRate.test.ts`

## src/lib/supabase/
- **createAdminClient** (function) -> `src/lib/supabase/admin.ts:3`
  - returns: SupabaseClient (service role, bypass RLS)
- **createClient** (function, browser) -> `src/lib/supabase/client.ts:3`
  - returns: SupabaseClient (anon key, browser)
- **getSessionAccessToken** (function) -> `src/lib/supabase/client.ts:10`
  - returns: Promise<string | null>
- **createClient** (function, server) -> `src/lib/supabase/server.ts:4`
  - returns: SupabaseClient (SSR, cookies)

## src/lib/ (auth & team)
- **AuthProvider** (component) -> `src/lib/auth.tsx:28`
  - provides: user, session, loading, signOut, refreshUser
- **useAuth** (hook) -> `src/lib/auth.tsx:24`
  - returns: AuthContextType
- **TeamProvider** (component) -> `src/lib/team.tsx:59`
  - provides: currentTeam, teams, userRole, clubMemberships, switchTeam
- **useTeam** (hook) -> `src/lib/team.tsx:41`
  - returns: TeamContextType

## src/lib/ (API auth)
- **getAuthUser** (function) -> `src/lib/api-auth.ts:5`
  - params: (req: Request)
  - returns: Promise<User | null>
- **getAuthUserDetailed** (function) -> `src/lib/api-auth.ts:14`
  - params: (req: Request)
  - returns: Promise<{user, reason?}>
- **isTeamMember** (function) -> `src/lib/api-auth.ts:46`
- **getTeamRole** (function) -> `src/lib/api-auth.ts:56`
- **isTeamCoach** (function) -> `src/lib/api-auth.ts:69`
- **authFetch** (function) -> `src/lib/api-client.ts:5`
  - params: (input, init?)
  - returns: Promise<Response> (auto-injects Bearer token)

## src/lib/ (notifications & push)
- **enablePushSubscription** (function) -> `src/lib/push.ts:45`
  - params: (userId, teamId)
  - returns: Promise<{ok, error?}> — registers SW + subscribes push
- **disablePushSubscription** (function) -> `src/lib/push.ts:85`
- **usePushNotifications** (hook) -> `src/lib/usePushNotifications.ts:8`
  - auto-registers push on mount if permission granted
- **ensureAttendanceRows** (function) -> `src/lib/convocations.ts:6`
  - params: (eventId, teamId, userIds)
  - creates attendance rows for convoked players
- **webpush** (default export) -> `src/lib/webpush.ts:18`
  - configured web-push instance with hardcoded VAPID keys
- **NOTIFICATION_TYPES** (const) -> `src/lib/notificationTypes.ts:7`
  - 19 notification types (convocation, rappel, message, etc.)
- **defaultNotificationPrefs** (function) -> `src/lib/notificationTypes.ts:110`
- **fetchTeamRecipientIds** (function) -> `src/lib/playerAlerts.ts:6`
- **notifyPhysicalTest** (function) -> `src/lib/playerAlerts.ts:37`
- **notifyDeparture** (function) -> `src/lib/playerAlerts.ts:81`

## src/lib/ (deliver-notifications & auto-convocations)
- **deliverPendingNotifications** (async function) -> `src/lib/deliver-notifications.ts:44`
  - params: (supabase: SupabaseClient)
  - returns: Promise\<DeliveryResult\> — fetches pending notifs, sends push, marks delivered_at
  - handles: missing subscriptions (marks delivered anyway), expired endpoints (410 cleanup), push_enabled prefs
  - deps: [ensureAttendanceRows, webpush]
- **DeliveryResult** (interface) -> `src/lib/deliver-notifications.ts:5`
  - fields: sent, delivered, skipped.noSubscription, skipped.pushDisabled
- **createAutoConvocations** (async function) -> `src/lib/auto-convocations.ts:20`
  - params: (supabase: SupabaseClient)
  - returns: Promise\<AutoConvocationResult\> — auto-creates convocations based on convocation_lead_days
  - idempotent: skips events where convocations_sent_at is already set
  - deps: [ensureAttendanceRows]
- **AutoConvocationResult** (interface) -> `src/lib/auto-convocations.ts:4`
  - fields: eventsProcessed, notificationsCreated

## src/app/api/notifications/
- **GET /api/notifications/cron** -> `src/app/api/notifications/cron/route.ts:10`
  - Cron orchestrator: delivery first, then generators (rappels, digest, echeances, relances, equite, felicitations), then auto-convocations
  - Architecture: "delivery first" — delivers existing pending notifs BEFORE generating new ones
  - deps: [createAdminClient, deliverPendingNotifications, createAutoConvocations, currentSeasonLabel]
- **POST /api/notifications/send** -> `src/app/api/notifications/send/route.ts:40`
  - Manual send: validates auth, team membership, rate limit
  - Immediate push delivery or scheduled
  - deps: [getAuthUserDetailed, ensureAttendanceRows, webpush, rateLimit]
- **POST /api/notifications/subscribe** -> `src/app/api/notifications/subscribe/route.ts:5`
  - Upserts push subscription
- **DELETE /api/notifications/subscribe** -> `src/app/api/notifications/subscribe/route.ts:51`

## src/lib/ (rate limiting)
- **rateLimit** (function) -> `src/lib/rateLimit.ts:21`
  - in-memory token bucket rate limiter
- **NOTIFY_LIMIT** (const) -> `src/lib/rateLimit.ts:36`
  - 30 requests / 60s

## src/lib/ (training & AI)
- **generateSessionWithAI** (function) -> `src/lib/training/ai-generator.ts:363`
- **renderSessionPdf** (function) -> `src/lib/training/pdf.tsx:448`
- **generateAnnouncement** (function) -> `src/lib/announcements/ai-generator.ts:108`
- **generateWeeklyChallenge** (function) -> `src/lib/challenges/ai-generator.ts:65`
- **generateSeasonPlan** (function) -> `src/lib/seasonPlan.ts:62`
- **generateQuarterlyReports** (function) -> `src/lib/quarterlyReport.ts:65`

## src/lib/ (utils)
- **cn** (function) -> `src/lib/utils.ts:4` (clsx + tailwind-merge)
- **currentSeasonLabel** (function) -> `src/lib/goals.ts:23`
- **seasonDateRange** (function) -> `src/lib/goals.ts:35`
- **useQueryCache** (hook) -> `src/lib/queryCache.ts:64`
- **useSelectedChild** (hook) -> `src/lib/useSelectedChild.ts:23`
- **useChatUnread** (hook) -> `src/lib/useChatUnread.ts:16`

## src/components/ (key components)
- **ConvocationsDialog** (component) -> `src/components/ConvocationsDialog.tsx:54`
  - Coach UI: manage convocations, send push, add/remove players
- **PushNotificationInit** (component) -> `src/components/PushNotificationInit.tsx:5`
  - Wrapper for usePushNotifications hook
- **EventDetail** (component) -> `src/components/EventDetail.tsx`
- **LiveMatchTracker** (component) -> `src/components/LiveMatchTracker.tsx`
- **InstallPrompt** (component) -> `src/components/InstallPrompt.tsx`
- **Sidebar** (component) -> `src/components/layout/Sidebar.tsx`
- **BottomNav** (component) -> `src/components/layout/BottomNav.tsx`
- **TopBar** (component) -> `src/components/layout/TopBar.tsx`
