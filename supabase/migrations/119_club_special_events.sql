-- 119_club_special_events.sql
-- Événementiel spécial (tournoi, gala, match de gala…) :
--   * le comité annonce un événement (titre, description, date, lieu, prix
--     par place, capacité max) et l'ouvre aux inscriptions ;
--   * chaque membre du club s'inscrit (nombre de places, note) ;
--   * le jour J, le comité « pointe » les présents (émargement) et voit les
--     recettes cumulées (places × prix).
--
-- RLS : lecture par adhésion au club ; gestion des événements = comité ;
-- chacun gère SA ligne d'inscription (sauf check-in = comité).

create table if not exists public.club_special_events (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  title text not null check (char_length(title) <= 200),
  description text,
  event_date date,
  start_time time,
  location text,
  price numeric(10,2) not null default 0 check (price >= 0),
  capacity integer not null default 0 check (capacity >= 0), -- 0 = illimité
  status text not null default 'announced'
    check (status in ('announced', 'open', 'closed', 'cancelled')),
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.club_event_attendees (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.club_special_events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  places integer not null default 1 check (places between 1 and 20),
  note text,
  checked_in boolean not null default false,
  checked_in_at timestamptz,
  created_at timestamptz not null default now(),
  unique (event_id, user_id)
);

create index if not exists idx_club_special_events_club ON public.club_special_events(club_id);
create index if not exists idx_club_event_attendees_event ON public.club_event_attendees(event_id);

alter table public.club_special_events enable row level security;
alter table public.club_event_attendees enable row level security;

drop policy if exists "Club members view special events" ON public.club_special_events;
create policy "Club members view special events"
  ON public.club_special_events FOR SELECT
  USING (public.is_club_member(club_id));

drop policy if exists "Committee manage special events" ON public.club_special_events;
create policy "Committee manage special events"
  ON public.club_special_events FOR ALL
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

drop policy if exists "Club members view event attendees" ON public.club_event_attendees;
create policy "Club members view event attendees"
  ON public.club_event_attendees FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.club_special_events e
      WHERE e.id = event_id AND public.is_club_member(e.club_id)
    )
  );

drop policy if exists "Members insert own attendance" ON public.club_event_attendees;
create policy "Members insert own attendance"
  ON public.club_event_attendees FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.club_special_events e
      WHERE e.id = event_id AND public.is_club_member(e.club_id)
    )
  );

drop policy if exists "Members update own attendance" ON public.club_event_attendees;
create policy "Members update own attendance"
  ON public.club_event_attendees FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND NOT checked_in
  );

drop policy if exists "Members delete own attendance" ON public.club_event_attendees;
create policy "Members delete own attendance"
  ON public.club_event_attendees FOR DELETE
  USING (auth.uid() = user_id);

drop policy if exists "Committee check attendance" ON public.club_event_attendees;
create policy "Committee check attendance"
  ON public.club_event_attendees FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.club_special_events e
      JOIN public.club_members cm ON cm.club_id = e.club_id
      WHERE e.id = event_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'comite'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.club_special_events e
      JOIN public.club_members cm ON cm.club_id = e.club_id
      WHERE e.id = event_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'comite'
    )
  );

grant select, insert, update, delete on public.club_special_events TO authenticated;
grant select, insert, update, delete on public.club_event_attendees TO authenticated;