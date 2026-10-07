-- 116_board_meetings.sql
-- Réunions du bureau & décisions :
--   * le comité convoque une réunion (date, heure, lieu, ordre du jour) ;
--   * une fois tenue, des décisions y sont rattachées (proposée / adoptée /
--     rejetée) et les membres du comité votent (pour / contre / abstention) ;
--   * les votes servent de décompte : la décision est validée ou non.
--
-- RLS : lecture par adhésion au club (`is_club_member`, 111) ; gestion
-- (réunions + décisions) = comité ; votes = chaque membre du comité gère
-- seulement son propre vote.

create table if not exists public.board_meetings (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  title text not null check (char_length(title) <= 200),
  meeting_date date,
  start_time time,
  location text,
  status text not null default 'planned'
    check (status in ('planned', 'held', 'cancelled')),
  agenda jsonb not null default '[]'::jsonb,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.board_decisions (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.board_meetings(id) on delete cascade,
  title text not null check (char_length(title) <= 200),
  description text,
  outcome text not null default 'proposed'
    check (outcome in ('proposed', 'adopted', 'rejected')),
  decided_by uuid references public.profiles(id) on delete set null,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.board_votes (
  id uuid primary key default gen_random_uuid(),
  decision_id uuid not null references public.board_decisions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  choice text not null check (choice in ('pour', 'contre', 'abstention')),
  created_at timestamptz not null default now(),
  unique (decision_id, user_id)
);

create index if not exists idx_board_meetings_club ON public.board_meetings(club_id);
create index if not exists idx_board_decisions_meeting ON public.board_decisions(meeting_id);
create index if not exists idx_board_votes_decision ON public.board_votes(decision_id);

alter table public.board_meetings enable row level security;
alter table public.board_decisions enable row level security;
alter table public.board_votes enable row level security;

drop policy if exists "Club members view board meetings" ON public.board_meetings;
create policy "Club members view board meetings"
  ON public.board_meetings FOR SELECT
  USING (public.is_club_member(club_id));

drop policy if exists "Committee manage board meetings" ON public.board_meetings;
create policy "Committee manage board meetings"
  ON public.board_meetings FOR ALL
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

drop policy if exists "Club members view board decisions" ON public.board_decisions;
create policy "Club members view board decisions"
  ON public.board_decisions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.board_meetings m
      WHERE m.id = meeting_id AND public.is_club_member(m.club_id)
    )
  );

drop policy if exists "Committee manage board decisions" ON public.board_decisions;
create policy "Committee manage board decisions"
  ON public.board_decisions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.board_meetings m
      JOIN public.club_members cm ON cm.club_id = m.club_id
      WHERE m.id = meeting_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'comite'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.board_meetings m
      JOIN public.club_members cm ON cm.club_id = m.club_id
      WHERE m.id = meeting_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'comite'
    )
  );

drop policy if exists "Club members view board votes" ON public.board_votes;
create policy "Club members view board votes"
  ON public.board_votes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.board_decisions d
      JOIN public.board_meetings m ON m.id = d.meeting_id
      WHERE d.id = decision_id AND public.is_club_member(m.club_id)
    )
  );

drop policy if exists "Committee members insert own vote" ON public.board_votes;
create policy "Committee members insert own vote"
  ON public.board_votes FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.board_decisions d
      JOIN public.board_meetings m ON m.id = d.meeting_id
      JOIN public.club_members cm ON cm.club_id = m.club_id
      WHERE d.id = decision_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'comite'
    )
  );

drop policy if exists "Committee members update own vote" ON public.board_votes;
create policy "Committee members update own vote"
  ON public.board_votes FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

drop policy if exists "Committee members delete own vote" ON public.board_votes;
create policy "Committee members delete own vote"
  ON public.board_votes FOR DELETE
  USING (auth.uid() = user_id);

grant select, insert, update, delete on public.board_meetings TO authenticated;
grant select, insert, update, delete on public.board_decisions TO authenticated;
grant select, insert, update, delete on public.board_votes TO authenticated;