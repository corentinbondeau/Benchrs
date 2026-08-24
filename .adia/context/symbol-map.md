# Symbol Map
> Genere par @init_project le 2026-08-24 — Projet Benchrs
> Derniere mise a jour : 2026-08-24 (reconciliation fix-auto-convocations)

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
