# Dependency Graph
> Genere par @init_project le 2026-08-24 — Projet Benchrs
> Derniere mise a jour : 2026-08-24 (reconciliation fix-auto-convocations)

## Dependances internes (module -> module)

### Flux des notifications (critique pour le bug en cours)
```
ConvocationsDialog (UI)
  -> authFetch("/api/notifications/send") [POST]
    -> api/notifications/send/route.ts
      -> lib/api-auth (getAuthUserDetailed, isTeamMember, getTeamRole)
      -> lib/rateLimit (rateLimit, NOTIFY_LIMIT)
      -> lib/convocations (ensureAttendanceRows)
      -> lib/webpush (webpush.sendNotification)
      -> supabase/admin (createAdminClient)

Vercel Cron (GET /api/notifications/cron)
  -> api/notifications/cron/route.ts
    -> lib/deliver-notifications (deliverPendingNotifications) [FIRST — "delivery first"]
      -> lib/convocations (ensureAttendanceRows)
      -> lib/webpush (webpush.sendNotification)
    -> [generators: rappels, digest, echeances, relances, equite, felicitations]
    -> lib/auto-convocations (createAutoConvocations) [LAST]
      -> lib/convocations (ensureAttendanceRows)
    -> lib/goals (currentSeasonLabel, seasonDateRange)
    -> supabase/admin (createAdminClient)

PushNotificationInit (component, dashboard layout)
  -> lib/usePushNotifications (hook)
    -> lib/push (enablePushSubscription)
      -> lib/api-client (authFetch)
        -> lib/supabase/client (getSessionAccessToken)
      -> api/notifications/subscribe [POST]
```

### Flux d'authentification
```
(auth) pages -> supabase/client (createClient)
api/auth/* routes -> supabase/admin (createAdminClient)
(dashboard) layout -> AuthProvider -> TeamProvider -> TeamGuard
api/* routes -> lib/api-auth -> supabase/admin
```

### Flux IA
```
api/trainings/generate -> lib/training/ai-generator -> Mistral API
api/announcements/generate -> lib/announcements/ai-generator -> Mistral API
api/season/report -> lib/season/ai-generator -> Mistral API
api/season/plan -> lib/seasonPlan -> Mistral API
api/reports/quarterly -> lib/quarterlyReport -> Mistral API
api/challenges/generate -> lib/challenges/ai-generator -> Mistral API
```

## Dependances externes critiques
- **supabase** -> Supabase Cloud (auth, DB, storage, realtime)
- **webpush** -> Web Push Protocol (VAPID, endpoint navigateur)
- **nodemailer** -> SMTP (reset password uniquement)
- **Mistral** -> Mistral AI API (generation texte)

## Analyse d'impact
- Modifier **supabase/** impacte : TOUT (chaque module en depend)
- Modifier **lib/api-auth** impacte : toutes les API routes (49 routes)
- Modifier **lib/webpush** impacte : deliver-notifications + notifications/send (livraison push)
- Modifier **lib/convocations** impacte : deliver-notifications + auto-convocations + notifications/send (creation attendances)
- Modifier **lib/deliver-notifications** impacte : notifications/cron (delivery engine)
- Modifier **lib/auto-convocations** impacte : notifications/cron (auto-convocation engine)
- Modifier **lib/push** impacte : PushNotificationInit + settings push (souscription client)
- **supabase/admin** est le point critique central (toutes les routes serveur)
