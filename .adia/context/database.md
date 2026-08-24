# Database — Benchrs
> Genere par @init_project le 2026-08-24 — Projet Benchrs
> Derniere mise a jour : 2026-08-24

## Backend
- **Supabase** (PostgreSQL managed)
- 74 migrations SQL dans `supabase/migrations/`
- Schema initial complet : `000_full_schema.sql`
- RLS (Row Level Security) actif sur toutes les tables

## Tables principales
| Table | Role |
|-------|------|
| profiles | Utilisateurs (joueurs, coachs, parents) |
| teams | Equipes |
| team_members | Liaison user/team avec role |
| clubs | Clubs (multi-equipes) |
| club_members | Liaison user/club avec role |
| events | Matchs et entrainements |
| attendances | Presences/convocations par event |
| match_stats | Statistiques de match par joueur |
| notifications | File d'attente de notifications |
| push_subscriptions | Endpoints push par user |
| notification_preferences | Preferences push/email par type |
| chat_channels | Canaux de messagerie |
| chat_messages | Messages |
| parent_student | Liaison parent/enfant par equipe |
| team_settings | Parametres equipe (reminders, seuils) |
| cotisations | Cotisations joueurs |
| training_sessions | Fiches d'entrainement |
| championships | Championnats |

## Tables liees aux notifications (bug en cours)
- `notifications` : id, user_id, team_id, type, title, body, reference_id, url, scheduled_for, delivered_at, is_read, created_at
- `push_subscriptions` : id, user_id, team_id, endpoint, p256dh, auth, created_at (unique: user_id + endpoint)
- `notification_preferences` : user_id, team_id, type, push_enabled, email_enabled
- `events.convocations_sent_at` : timestamp de l'envoi des convocations
- `attendances.status` : "pending" | "present" | "absent" | "late" | "excused"

## Migrations notables
- 019: convocation_scheduling + profile RLS
- 020: notification_preferences
- 021: push_subscriptions unique constraint
- 022: notifications.url column
- 024: events.convocations_sent_at
- 028/029: cleanup future convocations
- 030: security hardening
