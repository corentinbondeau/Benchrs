-- 112_club_volunteers.sql
-- Bénévoles & buvette : le comité ouvre des créneaux de volontariat
-- (buvette, encadrement, arbitrage…) pour un événement ; les membres du
-- club s'inscrivent sur un créneau (limite `needed` respectée côté code).
--
-- RLS :
--   * club_volunteer_slots      — SELECT par adhésion au club, gestion
--     (INSERT/UPDATE/DELETE) réservée au comité.
--   * club_volunteer_signups    — SELECT par adhésion au club (via le
--     créneau), chaque utilisateur ne gère QUE sa propre inscription.

create table if not exists public.club_volunteer_slots (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  team_id uuid references public.teams(id) on delete set null,
  title text not null check (char_length(title) <= 200),
  category text not null default 'benevole'
    check (category IN ('benevole', 'buvette', 'accompagnement', 'arbitrage', 'autre')),
  event_date timestamptz,
  location text,
  start_time timestamptz,
  end_time timestamptz,
  needed int not null default 1 check (needed >= 1 AND needed <= 100),
  status text not null default 'open'
    check (status IN ('open', 'closed', 'cancelled')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.club_volunteer_signups (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references public.club_volunteer_slots(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  note text,
  created_at timestamptz not null default now(),
  unique (slot_id, user_id)
);

create index if not exists idx_club_volunteer_slots_club ON public.club_volunteer_slots(club_id);
create index if not exists idx_club_volunteer_signups_slot ON public.club_volunteer_signups(slot_id);

alter table public.club_volunteer_slots enable row level security;
alter table public.club_volunteer_signups enable row level security;

drop policy if exists "Club members view volunteer slots" ON public.club_volunteer_slots;
create policy "Club members view volunteer slots"
  ON public.club_volunteer_slots FOR SELECT
  USING (public.is_club_member(club_id));

drop policy if exists "Committee manage volunteer slots" ON public.club_volunteer_slots;
create policy "Committee manage volunteer slots"
  ON public.club_volunteer_slots FOR ALL
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

drop policy if exists "Club members view volunteer signups" ON public.club_volunteer_signups;
create policy "Club members view volunteer signups"
  ON public.club_volunteer_signups FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.club_volunteer_slots s
      WHERE s.id = slot_id
        AND public.is_club_member(s.club_id)
    )
  );

drop policy if exists "Volunteers insert own signup" ON public.club_volunteer_signups;
create policy "Volunteers insert own signup"
  ON public.club_volunteer_signups FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.club_volunteer_slots s
      WHERE s.id = slot_id
        AND public.is_club_member(s.club_id)
    )
  );

drop policy if exists "Volunteers update own signup" ON public.club_volunteer_signups;
create policy "Volunteers update own signup"
  ON public.club_volunteer_signups FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

drop policy if exists "Volunteers delete own signup" ON public.club_volunteer_signups;
create policy "Volunteers delete own signup"
  ON public.club_volunteer_signups FOR DELETE
  USING (auth.uid() = user_id);

grant select, insert, update, delete ON public.club_volunteer_slots TO authenticated;
grant select, insert, update, delete ON public.club_volunteer_signups TO authenticated;