-- 118_staff_qualifications.sql
-- Diplômes & formations de l'encadrement : le comité enregistre les
-- qualifications (BMF, BE, UEFA A/B, BAFA, PSC1, autre) des membres de
-- l'encadrement (coachs/owners des équipes du club, comité), avec les dates
-- d'obtention et d'expiration. La page alerte sur les échéances et permet
-- d'envoyer un rappel de reconduction au membre concerné.
--
-- RLS : lecture par adhésion au club ; gestion = comité.

create table if not exists public.staff_qualifications (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  qualification text not null
    check (qualification in ('bmf', 'be', 'uefa_b', 'uefa_a', 'bafa', 'psc1', 'autre')),
  label text,
  issued_at date,
  expires_at date,
  notes text,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (club_id, user_id, qualification)
);

create index if not exists idx_staff_qualifications_club ON public.staff_qualifications(club_id);

alter table public.staff_qualifications enable row level security;

drop policy if exists "Club members view staff qualifications" ON public.staff_qualifications;
create policy "Club members view staff qualifications"
  ON public.staff_qualifications FOR SELECT
  USING (public.is_club_member(club_id));

drop policy if exists "Committee manage staff qualifications" ON public.staff_qualifications;
create policy "Committee manage staff qualifications"
  ON public.staff_qualifications FOR ALL
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

grant select, insert, update, delete on public.staff_qualifications TO authenticated;