# Dependency Graph
> Genere par @init_project le 2026-08-24 — Projet Benchrs
> Derniere mise a jour : 2026-08-27 (reconciliation fiche-joueur-composition)

## Dependances internes (module -> module)

### Flux de composition d'equipe (lineup) — NOUVEAU (fiche-joueur-composition)
Deux points d'entree UI, **un seul editeur**, un noyau de fonctions pures.
```
tactics/page.tsx (onglet "Feuille de match")
  -> tactics/FeuilletMatchTab.tsx  [WRAPPER 54 l. — chemin fige par tactics-split.test.ts]
       fetch events (type='match') -> LineupEditor showEventPicker={true}

matches/[id]/page.tsx (carte "Composition")
  -> isCoach  ? LineupEditor showEventPicker={false} eventId={params.id}
                  onSaved -> reloadLineupData() [re-fetch formations + match_lineups]
     :          carte read-only (inchangee pour joueur/parent)

LineupEditor (src/components/lineup/LineupEditor.tsx)
  -> lib/lineup/formations   (FORMATIONS — 9 formations x 11 slots, role: PositionKey)
  -> lib/lineup/autoCompose  (autoCompose — pure, GK prioritaire, principal>secondaire)
       -> lib/lineup/positions (labelToKey, PositionKey)
  -> lib/lineup/toMatchLineups (toMatchLineupRows — pure, projection match_lineups)
       -> types (FormationData)
  -> components/lineup/PitchSVG
  -> lib/supabase/client (createClient) : table `formations` (source riche)
  -> lib/api-client (authFetch) · lib/team (useTeam) · components/ui (Dialog, Select, Button)
```
**Deux representations, une source de verite** : `formations.formation_data` est la source riche (positions + bench + captain_id) ; `match_lineups` en est une **projection denormalisee**, reconstruite par DELETE+INSERT via `toMatchLineupRows`. Ne jamais editer `match_lineups` directement.

### Flux d'edition des attributs joueur — NOUVEAU (fiche-joueur-composition)
```
roster/page.tsx -> components/stats/PlayerProfile.tsx  [edition inline reservee au coach]
  -> lib/positions (POSITIONS)  ==re-export==>  lib/lineup/positions
  -> lib/profile/buildProfileAttributesPayload (pure)
       -> supabase update `profiles` { preferred_foot, position, secondary_positions }
       ⛔ jamais la cle `role` (trigger SQL prevent_self_role_change)
```

### Vocabulaire de postes — source de verite unique
```
lib/lineup/positions.ts  (POSITION_KEYS, POSITION_LABELS, POSITIONS, labelToKey, POSITION_FAMILY)
  <- lib/positions.ts                (re-export pur de POSITIONS)
       <- settings/page.tsx
       <- components/stats/PlayerProfile.tsx
       <- lib/profile/buildProfileAttributesPayload.ts
  <- lib/lineup/formations.ts        (role: PositionKey sur chaque slot)
  <- lib/lineup/autoCompose.ts       (labelToKey)
```

### Garde-fou de parite legacy — NOUVEAU
```
src/**  --(npm run sync:legacy = scripts/sync-legacy.sh)-->  legacy-app/src/**
CI job `legacy-parity` (bloquant) -> npm run check:legacy-parity -> scripts/check-legacy-parity.mjs
CI job `legacy-build`             -> build du fork legacy-app/
tests : src/__tests__/legacy/parity.test.ts, src/__tests__/legacy/vercel-crons.test.ts
```

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
