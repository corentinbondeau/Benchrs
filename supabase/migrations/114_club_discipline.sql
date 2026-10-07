-- 114_club_discipline.sql
-- Registre discipline du club : suspensions, cartons, exclusions à
-- l'échelle du club (visible par le comité, alimenté par le comité).
--
-- RLS : SELECT par adhésion au club, INSERT/UPDATE/DELETE comité.

create table if not exists public.club_discipline (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  team_id uuid references public.teams(id) on delete set null,
  season text not null,
  offense_type text not null default 'autre'
    check (offense_type IN ('carton_jaune', 'carton_rouge', 'suspension', 'exclusion', 'autre')),
  label text,
  reason text,
  incident_date date not null default CURRENT_DATE,
  end_date date,
  status text not null default 'active'
    check (status IN ('active', 'resolved')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_club_discipline_club ON public.club_discipline(club_id);
create index if not exists idx_club_discipline_player ON public.club_discipline(player_id);

alter table public.club_discipline enable row level security;

drop policy if exists "Club members view discipline" ON public.club_discipline;
create policy "Club members view discipline"
  ON public.club_discipline FOR SELECT
  USING (public.is_club_member(club_id));

drop policy if exists "Committee manage discipline" ON public.club_discipline;
create policy "Committee manage discipline"
  ON public.club_discipline FOR ALL
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

grant select, insert, update, delete ON public.club_discipline TO authenticated;