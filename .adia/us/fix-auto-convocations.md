# Context US — fix-auto-convocations

## Résumé de l'US
Bug : les convocations automatiques ne s'envoient pas — aucune notification push reçue par les joueurs.

## Modules impactés
- **notifications** — cron/route.ts (delivery des notifs planifiées), send/route.ts (insertion + envoi push)
- **lib-notifications** — webpush.ts (VAPID), push.ts (souscription client), convocations.ts (attendances), usePushNotifications.ts (auto-registration)
- **events-matches** — calendar/page.tsx (scheduleConvocations), ConvocationsDialog.tsx (envoi manuel)

## Fragments à charger
- `fragments/notifications.md`
- `fragments/lib-notifications.md`
- `fragments/events-matches.md`

## Fichiers impactés

| Fichier | Rôle dans le bug | Criticité |
|---------|-------------------|-----------|
| `src/app/api/notifications/cron/route.ts` | Delivery des notifs planifiées (scheduled_for <= now) — 895 lignes, maxDuration=60s | 🔴 Haute |
| `src/app/api/notifications/send/route.ts` | Insertion des convocations + push immédiat ou planifié | 🟡 Moyenne |
| `src/app/(dashboard)/calendar/page.tsx` | `scheduleConvocations()` planifie les convocations avec scheduled_for | 🟡 Moyenne |
| `src/lib/webpush.ts` | Configuration VAPID (clés hardcodées) | 🟡 Moyenne |
| `src/lib/push.ts` | Souscription push côté client (enablePushSubscription) | 🟡 Moyenne |
| `src/lib/usePushNotifications.ts` | Hook d'auto-registration push au mount | 🟡 Moyenne |
| `src/lib/convocations.ts` | ensureAttendanceRows — création des lignes d'attendance | 🟢 Basse |
| `src/lib/supabase/admin.ts` | createAdminClient — log si SUPABASE_SERVICE_ROLE_KEY invalide | 🟡 Moyenne |
| `src/components/ConvocationsDialog.tsx` | Dialog coach envoi manuel via `/api/notifications/send` | 🟢 Basse |
| `public/sw.js` | Service Worker — gère l'événement `push` et `notificationclick` | 🟢 Basse |
| `vercel.json` | Config cron : `GET /api/notifications/cron` à 20h UTC | 🟢 Basse |

## Architecture du système de convocations

### Flux des convocations (analysé depuis le code source)

**Il n'existe PAS de convocations "automatiques" au sens propre.** Le système fonctionne en 2 chemins :

1. **Convocations manuelles** (depuis `ConvocationsDialog`) :
   - Coach sélectionne des joueurs → `authFetch("/api/notifications/send")` avec `type: "convocation"`
   - `send/route.ts` insère en DB avec `delivered_at = now` (pas de scheduled_for) + push immédiat
   - Appelle `ensureAttendanceRows` + met à jour `convocations_sent_at` sur l'event

2. **Convocations planifiées** (depuis `calendar/page.tsx` à la création d'événement) :
   - Coach crée un event avec `convocation_lead_days` et sélectionne des joueurs
   - `scheduleConvocations()` appelle `POST /api/notifications/send` avec `scheduled_for = event_date - lead_days`
   - `send/route.ts` insère en DB avec `scheduled_for` renseigné et `delivered_at = null`
   - **Le push n'est PAS envoyé** — la notification attend le cron

3. **Livraison par le cron** (`GET /api/notifications/cron` à 20h UTC) :
   - Le cron lit les notifications `scheduled_for <= now AND delivered_at IS NULL`
   - Envoie les push via webpush.sendNotification()
   - Marque `delivered_at` + appelle `ensureAttendanceRows` pour les convocations

### Flux du cron (9 étapes séquentielles, 895 lignes)

1. Auth CRON_SECRET
2. Rappels J-1 (type "rappel")
3. Digest hebdo (lundi uniquement, type "digest_hebdo")
4. Alertes échéances licences/certificats (type "echeance")
5. Relances convocation (joueurs sans réponse, type "relance_convocation")
6. Relances cotisations (type "relance")
7. Équité temps de jeu (lundi, type "equite_temps_jeu")
8. Félicitations (anniversaires, premier but, 50e match, type "felicitation")
9. **Delivery** : lit TOUTES les notifs pending, envoie les push, marque delivered_at

## Causes racines probables du bug (classées par probabilité)

### 🔴 1. Timeout Vercel (TRÈS PROBABLE) — Probabilité : 80%

**Preuve code :** `maxDuration = 60` (ligne 8 de cron/route.ts).

Le cron fait **9 étapes séquentielles** avant d'atteindre la livraison (étape 9). Chaque étape fait de multiples requêtes Supabase en série :
- `sendWeeklyDigest` : boucle sur TOUTES les équipes (via tous les events) → N requêtes par équipe
- `sendExpiryAlerts` : boucle sur TOUS les profils actifs
- `sendAttendanceReminders` : boucle sur tous les events dans 48h + vérification par joueur
- `sendCotisationReminders` : boucle sur toutes les cotisations pending
- `sendCongrats` : boucle sur tous les profils (anniversaires) + tous les matchs récents + stats de carrière

**Si une seule de ces étapes prend trop de temps (ex: beaucoup d'équipes, beaucoup de joueurs), le cron atteint le timeout de 60s AVANT l'étape de delivery.** Les notifications planifiées (scheduled_for) ne sont jamais livrées.

**Impact :** TOUTES les convocations planifiées restent en DB avec `delivered_at = null` indéfiniment.

### 🟡 2. Table `push_subscriptions` vide ou expirée (PROBABLE) — Probabilité : 60%

**Preuve code :** Dans le cron (lignes 193-196) :
```typescript
const subs = subsByUser.get(notif.user_id) || [];
if (subs.length === 0) {
  continue; // ← Skip silencieux ! Pas de log, pas d'erreur
}
```

Si un utilisateur n'a jamais souscrit au push (ou si sa souscription a expiré et été nettoyée par le cleanup 404/410), la notification est marquée comme "traitée" mais **aucun push n'est envoyé**, et **la notification n'est même pas marquée comme `delivered_at`** car `deliveredIds.push(notif.id)` est APRÈS la boucle de push (ligne 216).

**ATTENTION — BUG LOGIQUE CONFIRMÉ :** En regardant le code plus attentivement (lignes 189-227) :
- Si `subs.length === 0` → `continue` → la notif n'est jamais ajoutée à `deliveredIds`
- Résultat : la même notification est retraitée à chaque exécution du cron, mais ne sera JAMAIS livrée si l'utilisateur n'a pas de souscription push
- Cela crée une boucle infinie : le cron `SELECT ... LIMIT 500` ramène toujours les mêmes notifications non livrables, bloquant potentiellement la livraison des autres

**ATTENTION — 2ème BUG LOGIQUE :** Si les préférences de l'utilisateur désactivent le push (prefMap → `false`, ligne 190-192), même comportement : `continue` sans marquer `delivered_at`. La notification bloque la file indéfiniment.

### 🟡 3. CRON_SECRET non configuré sur Vercel (MODÉRÉ) — Probabilité : 40%

**Preuve code :** Lignes 11-14 :
```typescript
const cronSecret = process.env.CRON_SECRET;
if (!cronSecret || req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
```

Si `CRON_SECRET` n'est pas configuré dans les variables d'environnement Vercel, TOUT le cron retourne 401 silencieusement. Vercel Crons passe ce secret automatiquement, mais uniquement si la variable est définie.

### 🟢 4. SUPABASE_SERVICE_ROLE_KEY invalide (POSSIBLE) — Probabilité : 20%

**Preuve code :** `admin.ts` lignes 4-10 : un `console.error` est émis si la clé est invalide ou un placeholder, mais `createClient` est quand même appelé. Si la clé est invalide, toutes les requêtes Supabase du cron échoueront silencieusement (les résultats seront des tableaux vides).

### 🟢 5. Problème de souscription push client (POSSIBLE) — Probabilité : 15%

**Preuve code :** `usePushNotifications.ts` (lignes 19-20) :
```typescript
if (Notification.permission !== "granted") return;
```

Le hook ne demande PAS la permission — il ne s'enregistre QUE si la permission est déjà "granted". Si l'utilisateur n'a jamais cliqué "Autoriser", aucune souscription n'est créée. L'inscription push nécessite une action explicite via `enablePushSubscription` (appelé dans `push.ts` ou les settings).

### 🟢 6. Mismatch VAPID client/serveur (ÉCARTÉ) — Probabilité : 5%

Les clés VAPID sont hardcodées dans le code (pas d'env vars) et la même clé publique est utilisée côté client (`push.ts` FALLBACK_VAPID_KEY) et serveur (`webpush.ts` FALLBACK_VAPID_PUBLIC_KEY). Le mismatch est donc écarté tant que le code est cohérent (vérifié : les clés sont identiques).

## Zones critiques

### 1. File de notifications bloquée (BUG CONFIRMÉ dans le code)
- **Fichier :** `cron/route.ts` lignes 189-227
- **Problème :** Les notifications dont l'utilisateur n'a pas de souscription push ou a désactivé les préférences ne sont JAMAIS marquées `delivered_at`. Elles reviennent à chaque exécution du cron dans le `SELECT ... LIMIT 500`, bloquant potentiellement la livraison d'autres notifications.
- **Fix nécessaire :** Marquer `delivered_at` même si le push n'est pas envoyé (l'utilisateur la verra quand même dans l'app, au prochain chargement de la page notifications).

### 2. Timeout cron (RISQUE ARCHITECTURAL)
- **Fichier :** `cron/route.ts` — 895 lignes, maxDuration=60s
- **Problème :** 9 étapes séquentielles avec des requêtes N+1, dont certaines bouclent sur TOUTES les équipes/profils/joueurs. Aucune parallélisation, aucun garde-temps.
- **Fix nécessaire :** Soit découper le cron en sous-crons distincts (un pour les rappels, un pour les digests, un pour la delivery), soit inverser l'ordre (delivery EN PREMIER, puis les étapes de création).

### 3. `convocation_lead_days` non utilisé par le cron
- **Fichier :** Aucun — le champ existe en DB mais n'est jamais lu par le cron
- **Problème :** Le cron ne crée PAS de convocations automatiques basées sur `convocation_lead_days`. Les convocations planifiées sont créées côté client (calendar/page.tsx `scheduleConvocations`), ce qui nécessite que le coach sélectionne des joueurs lors de la création de l'événement.
- **Impact :** Si le coach crée un événement sans sélectionner de joueurs, AUCUNE convocation n'est envoyée. La notion de "convocations automatiques" n'existe pas réellement — c'est du "planifié manuellement".

### 4. Skip silencieux sans log
- **Fichier :** `cron/route.ts` lignes 190-196
- **Problème :** Quand un utilisateur n'a pas de souscription ou a désactivé ses préférences, le cron fait `continue` sans aucun log. Impossible de diagnostiquer le problème sans modifier le code.

## Propagation (impact indirect)
- Modifier `cron/route.ts` impacte : la livraison de TOUS les types de notifications (pas seulement les convocations)
- Modifier `webpush.ts` impacte : `cron/route.ts` + `send/route.ts` + `availability/notify/route.ts`
- Modifier `push.ts` impacte : `usePushNotifications.ts` + settings push + `enablePushSubscription`
- Modifier la table `notifications` impacte : page notifications + cron + send + tous les types

## Zones chaudes
- `src/app/api/notifications/cron/route.ts` — 13 commits (fichier backend le plus modifié), 895 lignes
- `src/app/(dashboard)/calendar/page.tsx` — 28 commits, contient `scheduleConvocations`
- `src/app/(dashboard)/matches/[id]/page.tsx` — 25 commits, utilise `convocations_sent_at`

## Skills pertinents
Aucun skill `.adia/skills/` n'existe pour ce projet.

## Dépendances externes
- **web-push** (npm) — bibliothèque Node.js pour l'envoi push via VAPID
- **Supabase** — PostgreSQL (tables: notifications, push_subscriptions, notification_preferences, attendances, events)
- **Vercel Crons** — déclencheur du job `GET /api/notifications/cron` à 20h UTC
- **Service Worker** (`public/sw.js`) — gestion de l'événement `push` côté navigateur

## Recommandations de fix (pour @planner et @dev)

### Fix prioritaire — File bloquée (impact immédiat)
1. Dans `cron/route.ts`, marquer `delivered_at` pour TOUTES les notifications traitées, même celles sans souscription push ou avec préférences désactivées. La notification reste lisible in-app.
2. Ajouter des logs pour les notifications skippées (pas de souscription, préférences off).

### Fix structural — Timeout cron
3. **Inverser l'ordre** dans le cron : faire la **delivery** EN PREMIER (avant les rappels/digests/relances). Ainsi même si le cron timeout, les notifications planifiées sont livrées.
4. Ou : découper le cron en 2+ jobs Vercel distincts (delivery à 19h55, création à 20h).

### Fix optionnel — Convocations vraiment automatiques
5. Si le coach souhaite des convocations automatiques (sans sélectionner de joueurs), implémenter dans le cron une étape qui lit `convocation_lead_days` et crée les notifications de convocation pour TOUS les joueurs actifs de l'équipe, `lead_days` jours avant l'événement.
