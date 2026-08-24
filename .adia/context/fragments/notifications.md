# Fragment — notifications
> Genere par @init_project le 2026-08-24
> Derniere mise a jour : 2026-08-24 (reconciliation fix-auto-convocations)
> Module path : src/app/api/notifications/

## Responsabilite
Orchestration du systeme de notifications push : cron "delivery first" (livre d'abord les notifs pending, puis genere les nouvelles), envoi manuel par les coachs, et gestion des souscriptions push des navigateurs. La logique de delivery et d'auto-convocation a ete extraite dans des modules dedies.

## Fichiers cles
| Fichier | Role |
|---------|------|
| cron/route.ts | Cron Vercel (826 lignes) : orchestrateur "delivery first" — 1) deliverPendingNotifications, 2) generators (rappels, digest, echeances, relances, equite, felicitations), 3) createAutoConvocations |
| send/route.ts | Envoi manuel (236 lignes) : validation auth/team/rate-limit, insertion notif, push immediat ou planifie |
| subscribe/route.ts | Souscription push (78 lignes) : upsert endpoint, DELETE pour desabonnement |
| __tests__/cron-order.test.ts | Test Vitest : verifie l'ordre d'execution (delivery AVANT auto-convocations) |

## Architecture du cron (`GET /api/notifications/cron`) — "delivery first"
1. **Auth** : verifie `CRON_SECRET` en header Bearer
2. **DELIVERY FIRST** : `deliverPendingNotifications(supabase)` — livre toutes les notifs pending AVANT d'en generer de nouvelles (empeche la file de grossir indefiniment)
3. **Generators** (genere de nouvelles notifs pour le prochain cycle) :
   - Rappels J-1 : events du lendemain
   - Digest hebdo (lundi) : resume resultats + prochain match + seances
   - Echeances : licences/certificats expirant dans 30 jours
   - Relances convocation : joueurs sans reponse dans 48h
   - Equite temps de jeu (lundi) : alerte coachs si joueurs sous le seuil
   - Felicitations : anniversaires, premier but, 50e match
4. **AUTO-CONVOCATIONS** : `createAutoConvocations(supabase)` — cree automatiquement les convocations basees sur `convocation_lead_days` dans `team_settings`

## Flux d'envoi manuel (`POST /api/notifications/send`)
1. Rate limit (30/min par IP)
2. Auth Bearer + verification team membership
3. Non-coachs : limites au type "message" sur un canal dont ils sont membres
4. Convocations : verifie que reference_id est un event de l'equipe
5. Insert en DB, push immediat ou planifie
6. Si type "convocation" immediat : `ensureAttendanceRows` + `convocations_sent_at`

## Points d'attention
- Le cron orchestre beaucoup de taches (826 lignes) — maxDuration=60s
- La logique critique (delivery, auto-convocations) est extraite et testee unitairement
- L'architecture "delivery first" garantit que les notifs existantes sont livrees meme si les generators echouent
- **Bug corrige** : les notifs sans souscription push sont maintenant marquees `delivered_at` (ne bloquent plus la file)
- **Bug corrige** : les auto-convocations sont basees sur `convocation_lead_days` (team_settings) et non plus planifiees manuellement
- Les endpoints push expires (404/410) sont nettoyes automatiquement
- Les preferences utilisateur (`notification_preferences`) sont respectees (`push_enabled`)

## Tables Supabase impliquees
- `notifications` : file d'attente (scheduled_for, delivered_at)
- `push_subscriptions` : endpoints push par user (user_id, endpoint, p256dh, auth)
- `notification_preferences` : preferences par type/user/team (push_enabled, email_enabled)
- `attendances` : presences aux events (creees par ensureAttendanceRows)
- `events` : evenements (convocations_sent_at)
- `team_settings` : attendance_reminders_enabled, min_playing_minutes, **convocation_lead_days** (nouveau)

## Tests associes
- `src/app/api/notifications/__tests__/cron-order.test.ts` — Vitest : verifie l'ordre d'execution du cron (delivery → generators → auto-convocations)
