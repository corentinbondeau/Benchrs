# Base de donnees

> PostgreSQL via Supabase — 60+ tables, 76 migrations, 100+ policies RLS.

## Vue d'ensemble

La base de donnees est geree par **Supabase** (PostgreSQL). Toutes les modifications de schema passent par des **migrations SQL** numerotees dans `supabase/migrations/`.

### Chiffres cles

| Metrique | Valeur |
|----------|--------|
| Tables | 60+ |
| Migrations | 76 (000 a 076) |
| Policies RLS | 100+ |
| Fonctions SQL | 7 |
| Extensions | 2 (`pg_trgm`, `btree_gist`) |
| Enums | 9 types |

## Relations principales

```
clubs ──────────┐
  │              │
  ├── club_members (comite)
  ├── club_aliases
  ├── pitches ── pitch_bookings
  ├── clubhouse_reservations
  ├── player_transfers
  ├── club_posts
  ├── activity_logs
  └── trial_requests
  │
  └── teams ─────────────────────┐
       │                          │
       ├── team_members ←→ profiles (users)
       ├── team_settings
       ├── team_tab_visibility
       ├── team_locations
       │
       ├── events ────────────────┐
       │    ├── attendances       │
       │    ├── match_stats       │
       │    ├── match_lineups     │
       │    ├── match_events      │
       │    ├── match_ratings     │
       │    ├── match_reports     │
       │    ├── match_availability│
       │    ├── match_checklist_* │
       │    ├── match_agenda_items│
       │    ├── motm_votes        │
       │    ├── training_sessions │
       │    ├── formations        │
       │    ├── session_rpe       │
       │    ├── session_feedback  │
       │    ├── locker_playlist_items
       │    ├── gallery_media     │
       │    ├── carpooling_trips  │
       │    │    └── carpooling_bookings
       │    └── tasks             │
       │                          │
       ├── championships          │
       │    └── championship_standings
       ├── tournaments            │
       │    └── tournament_matches│
       │                          │
       ├── chat_channels ─── chat_messages
       │    └── chat_members      │
       ├── notifications          │
       ├── push_subscriptions     │
       ├── notification_preferences
       │                          │
       ├── cotisations ── payment_history
       ├── treasury_transactions  │
       ├── inventory_items ── item_loans
       │                          │
       ├── season_cycles          │
       ├── season_reports         │
       ├── season_plans           │
       ├── quarterly_reports      │
       ├── season_storybooks      │
       ├── newsletters            │
       │                          │
       ├── weekly_challenges ── challenge_submissions
       ├── weekly_challenge_settings
       ├── personal_goals         │
       ├── player_notebook_entries│
       │                          │
       ├── albums ── gallery_media│
       ├── team_polls ── poll_votes
       └── parent_meetings ── meeting_signatures

profiles (users)
  ├── parent_student (parent ←→ enfant)
  ├── injuries
  ├── suspensions
  ├── player_physical_tests
  ├── physical_prep_documents
  ├── licences
  ├── fitness_ratings
  ├── season_greetings
  ├── trophies
  └── team_join_requests
```

## Tables principales

### Core : Clubs & Teams

| Table | Description | Colonnes cles |
|-------|-------------|---------------|
| `clubs` | Club parent | name, fff_number, is_public, public_slug, comite_invite_code |
| `club_members` | Membres du comite | club_id, user_id, role (president/comite) |
| `teams` | Equipes du club | club_id, name, invite_code, color_primary, color_secondary |
| `team_members` | Membres de l'equipe | team_id, user_id, role (owner/coach/player/parent) |
| `profiles` | Profils utilisateurs | first_name, last_name, role, vma, vmi, position, shirt_number |

### Evenements & Matchs

| Table | Description | Colonnes cles |
|-------|-------------|---------------|
| `events` | Matchs + entrainements | type, title, event_date, opponent, score_us, score_them, status |
| `attendances` | Presences/absences | event_id, user_id, status, minutes_played |
| `match_stats` | Stats par joueur | goals, assists, yellow_cards, red_cards, minutes_played |
| `match_lineups` | Compositions | player_id, position_label, is_starter |
| `match_events` | Timeline du match | event_type (goal, card, sub), player_id, minute |
| `match_ratings` | Notations coach | rater_id, player_id, rating (0-10) |
| `match_reports` | Comptes-rendus | content (JSONB), source (ai/manual) |
| `match_availability` | Disponibilites | player_id, availability (dispo/pas_dispo/incertain) |

### Entrainements & Physique

| Table | Description | Colonnes cles |
|-------|-------------|---------------|
| `training_sessions` | Fiches de seance | exercises (JSONB), objectives, source (ai/manual) |
| `exercise_library` | Bibliotheque d'exercices | name, duration, drill_type, schema (JSONB) |
| `player_physical_tests` | Tests VMA/VMI | test_type, value, tested_at |
| `session_rpe` | Charge d'entrainement | rpe (1-10), session_duration, form_level |
| `session_feedback` | Retours joueurs | rating, intensity, morale, comment |

### Communication

| Table | Description | Colonnes cles |
|-------|-------------|---------------|
| `chat_channels` | Canaux de discussion | name, channel_type, is_private, player_id |
| `chat_messages` | Messages | channel_id, sender_id, content |
| `notifications` | Alertes in-app | title, body, type, is_read |
| `push_subscriptions` | Abonnements push | endpoint, p256dh, auth |

### Administration

| Table | Description | Colonnes cles |
|-------|-------------|---------------|
| `cotisations` | Cotisations joueurs | amount_expected, amount_paid, status, due_date |
| `treasury_transactions` | Tresorerie | type (income/expense), amount, category |
| `inventory_items` | Materiel | name, category, quantity |
| `licences` | Licences joueurs | season, status, documents_received |

### Infrastructures Club

| Table | Description | Colonnes cles |
|-------|-------------|---------------|
| `pitches` | Terrains | club_id, name, location |
| `pitch_bookings` | Reservations terrain | pitch_id, weekday, start_time, end_time |
| `clubhouse_reservations` | Reservations club house | reservation_date, start_time, end_time, EXCLUDE constraint |

## Enums SQL

| Enum | Valeurs |
|------|---------|
| `user_role` | coach, player, parent |
| `team_member_role` | owner, coach, player, parent |
| `club_member_role` | president, comite |
| `event_type` | match, training |
| `event_status` | upcoming, ongoing, completed, cancelled |
| `attendance_status` | present, absent, late, excused, pending |
| `match_result` | win, loss, draw |
| `injury_status` | active, recovered |
| `carpooling_role` | driver, passenger |

## Fonctions SQL

| Fonction | Retour | Description |
|----------|--------|-------------|
| `user_club_ids()` | UUID[] | IDs des clubs dont l'utilisateur est membre (comite) |
| `user_visible_team_ids()` | UUID[] | IDs des equipes visibles (equipe + equipes du meme club) |
| `is_team_coach(team_id)` | BOOLEAN | Vrai si l'utilisateur est coach/owner |
| `is_team_owner(team_id)` | BOOLEAN | Vrai si l'utilisateur est owner |
| `is_club_president(club_id)` | BOOLEAN | Vrai si president ou createur du club |

## Policies RLS (resume)

### Pattern standard

```sql
-- Lecture : membres visibles (equipe + comite club)
CREATE POLICY "select" ON table FOR SELECT
  USING (team_id IN (SELECT user_visible_team_ids()));

-- Ecriture : coachs uniquement
CREATE POLICY "manage" ON table FOR ALL
  USING (is_team_coach(team_id));

-- Self : donnees personnelles
CREATE POLICY "self" ON table FOR ALL
  USING (auth.uid() = user_id);
```

### Cas speciaux

| Table | Particularite |
|-------|---------------|
| `clubs` | SELECT public si `is_public = true` |
| `teams` | SELECT public si club public |
| `profiles` | SELECT ouvert aux utilisateurs authentifies |
| `trial_requests` | INSERT ouvert a tous (formulaire public) |
| `clubhouse_reservations` | INSERT pour coachs ET comite |

## Guide : Creer une migration

1. **Trouver le prochain numero** :
```bash
ls supabase/migrations/ | tail -1
# → 076_public_showcase_rls.sql → prochain = 077
```

2. **Creer le fichier** : `supabase/migrations/077_ma_feature.sql`

3. **Template** :
```sql
-- Description de la migration
-- Date: YYYY-MM-DD

CREATE TABLE IF NOT EXISTS public.ma_table (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  -- ... colonnes
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ma_table_team ON public.ma_table(team_id);

-- RLS
ALTER TABLE public.ma_table ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can view" ON public.ma_table
  FOR SELECT USING (team_id IN (SELECT public.user_visible_team_ids()));

CREATE POLICY "Coaches can manage" ON public.ma_table
  FOR ALL USING (public.is_team_coach(team_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ma_table TO authenticated;
```

4. **Ajouter le type TypeScript** dans `src/types/index.ts`
