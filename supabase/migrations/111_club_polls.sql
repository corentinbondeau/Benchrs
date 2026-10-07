-- 111_club_polls.sql
-- Sondages du club : le comité lance un sondage (question + options,
-- choix unique ou multiple, fermeture optionnelle), les membres du club
-- votent (un seul vote par personne et par sondage).
--
-- RLS :
--   * club_polls        — SELECT par adhésion au club (user_club_ids, 048) ;
--     INSERT/UPDATE/DELETE réservés au comité.
--   * club_poll_votes   — SELECT via le sondage (club visible), chaque
--     utilisateur ne gère QUE sa propre ligne.

-- Helper : l'utilisateur est-il « membre du club » ?
-- Comité (`club_members`) OU membre (joueur/parent/coach) d'une équipe
-- du club (`team_members` → `teams.club_id`). Permet aux familles de voter
-- et voir les sondages sans être elles-mêmes au comité.
CREATE OR REPLACE FUNCTION public.is_club_member(p_club_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.club_members cm
    WHERE cm.club_id = p_club_id AND cm.user_id = p_user_id
    UNION ALL
    SELECT 1
    FROM public.teams t
    JOIN public.team_members tm ON tm.team_id = t.id
    WHERE t.club_id = p_club_id AND tm.user_id = p_user_id
  );
$$;

create table if not exists public.club_polls (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  question text not null check (char_length(question) <= 300),
  options jsonb not null default '[]'::jsonb,
  multiple boolean not null default false,
  closes_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.club_poll_votes (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.club_polls(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  option_values jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (poll_id, user_id)
);

create index if not exists idx_club_polls_club ON public.club_polls(club_id);
create index if not exists idx_club_poll_votes_poll ON public.club_poll_votes(poll_id);

alter table public.club_polls enable row level security;
alter table public.club_poll_votes enable row level security;

drop policy if exists "Club members view polls" ON public.club_polls;
create policy "Club members view polls"
  ON public.club_polls FOR SELECT
  USING (public.is_club_member(club_id));

drop policy if exists "Committee manage polls" ON public.club_polls;
create policy "Committee manage polls"
  ON public.club_polls FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.club_id = club_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'comite'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.club_id = club_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'comite'
    )
  );

drop policy if exists "Club members view poll votes" ON public.club_poll_votes;
create policy "Club members view poll votes"
  ON public.club_poll_votes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.club_polls p
      WHERE p.id = poll_id
        AND public.is_club_member(p.club_id)
    )
  );

drop policy if exists "Voters insert own vote" ON public.club_poll_votes;
create policy "Voters insert own vote"
  ON public.club_poll_votes FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.club_polls p
      WHERE p.id = poll_id
        AND public.is_club_member(p.club_id)
    )
  );

drop policy if exists "Voters update own vote" ON public.club_poll_votes;
create policy "Voters update own vote"
  ON public.club_poll_votes FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

drop policy if exists "Voters delete own vote" ON public.club_poll_votes;
create policy "Voters delete own vote"
  ON public.club_poll_votes FOR DELETE
  USING (auth.uid() = user_id);

grant select, insert, update, delete on public.club_polls TO authenticated;
grant select, insert, update, delete on public.club_poll_votes TO authenticated;