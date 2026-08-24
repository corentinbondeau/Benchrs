# Fragment — lib-notifications
> Genere par @init_project le 2026-08-24
> Derniere mise a jour : 2026-08-24 (reconciliation fix-auto-convocations)
> Module path : src/lib/ (fichiers lies aux notifications)

## Responsabilite
Helpers client et serveur pour le systeme de notifications push : souscription navigateur, configuration VAPID, types de notifications, creation des convocations, alertes joueurs. Inclut egalement les modules extraits de delivery et d'auto-convocation.

## Fichiers cles
| Fichier | Role |
|---------|------|
| push.ts | Client-side : souscription push (service worker, VAPID key), enable/disable |
| webpush.ts | Server-side : configuration web-push avec VAPID keys hardcodees |
| usePushNotifications.ts | Hook React : auto-registration push au mount si permission granted |
| convocations.ts | ensureAttendanceRows : cree les presences en base lors de l'envoi de convocation |
| notificationTypes.ts | 19 types de notification + factory de preferences par defaut |
| playerAlerts.ts | Client-side : notifyPhysicalTest, notifyDeparture (via authFetch -> /api/notifications/send) |
| **deliver-notifications.ts** | **NOUVEAU** (226 lignes) : delivery engine extraite du cron — fetchPending → sendPush → markDelivered. Gere les cas sans souscription (marque delivered quand meme), les endpoints expires (410 cleanup), et les prefs push_enabled. Appelle ensureAttendanceRows pour les convocations livrees. |
| **auto-convocations.ts** | **NOUVEAU** (194 lignes) : auto-convocation engine — cree automatiquement les convocations pour les events dont event_date tombe dans [now, now + convocation_lead_days]. Idempotent (skip si convocations_sent_at deja set). Notifie joueurs + parents. |
| __tests__/deliver-notifications.test.ts | Tests Vitest (6 cas) : delivery avec/sans souscription, push_enabled=false, endpoint expire, convocation delivery, zero pending |
| __tests__/auto-convocations.test.ts | Tests Vitest (5 cas) : creation dans fenetre lead_days, dedup, lead_days null/0, doublon attendance, inclusion parents |

## Architecture VAPID
- Cles VAPID **hardcodees** dans le code (pas d'env vars)
  - Public key dans `push.ts` (FALLBACK_VAPID_KEY)
  - Private key dans `webpush.ts` (FALLBACK_VAPID_PRIVATE_KEY)
  - Subject : `mailto:support@benchrs.app`
- Raison : les env vars Vercel ont ete observees vides/stub → mismatch VAPID
- **Risque securite** : la cle privee VAPID est visible dans le repo Git

## Flux de souscription push
1. `PushNotificationInit` monte dans le dashboard layout
2. `usePushNotifications` hook verifie : user logged, team selected, permission granted, push enabled local
3. Appelle `enablePushSubscription(userId, teamId)`
4. Enregistre le service worker (`/sw.js`), cree un `PushSubscription`
5. POST vers `/api/notifications/subscribe` avec les cles (endpoint, p256dh, auth)
6. Le serveur upsert dans `push_subscriptions`

## Flux delivery (`deliverPendingNotifications`)
1. Query : `scheduled_for <= now AND delivered_at IS NULL`
2. Pour chaque notif, cherche les souscriptions push du user
3. **Sans souscription** → marque `delivered_at` quand meme (corrige le bug de file bloquee)
4. **Push disabled** (prefs) → marque `delivered_at` quand meme
5. Envoie le push, gere les erreurs (410 → supprime la souscription)
6. Si type "convocation" : `ensureAttendanceRows` + `convocations_sent_at`

## Flux auto-convocation (`createAutoConvocations`)
1. Query `team_settings` pour recuperer `convocation_lead_days` par equipe
2. Pour chaque equipe avec `convocation_lead_days > 0` :
   - Cherche les events dans la fenetre [now, now + lead_days] avec `convocations_sent_at IS NULL`
   - Recupere les joueurs actifs + leurs parents
   - Insere des notifications type "convocation"
   - Appelle `ensureAttendanceRows`
   - Met a jour `convocations_sent_at` (dedup)

## Points d'attention
- `playerAlerts.ts` est marque `"use client"` mais appelle Supabase directement (devrait utiliser les RLS du browser client)
- `ensureAttendanceRows` utilise le admin client (bypass RLS) — normal car appele depuis les API routes
- Le hook `usePushNotifications` ne re-registre pas si le service worker est mis a jour
- `deliver-notifications.ts` et `auto-convocations.ts` sont des modules purs (pas de "use client/server"), testables unitairement
