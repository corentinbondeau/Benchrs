-- 117_club_newsletters.sql
-- Newsletter du club : le comité rédige une lettre d'info (titre + contenu),
-- choisit la cible (tout le club ou une équipe) et programme l'envoi.
-- La livraison réutilise l'infrastructure des notifications existantes :
-- insert `notifications` type `club_newsletter` avec `scheduled_for`, le cron
-- `/api/notifications/cron` les délivre quand leur échéance est atteinte.
-- L'envoi immédiat est géré par la route `/api/clubs/newsletter`.
--
-- RLS : lecture par adhésion au club ; création/gestion = comité.

create table if not exists public.club_newsletters (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  title text not null check (char_length(title) <= 200),
  content text not null check (char_length(content) <= 8000),
  audience text not null default 'all' check (audience in ('all', 'team')),
  team_id uuid references public.teams(id) on delete set null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'sent', 'cancelled')),
  scheduled_for timestamptz not null default now(),
  sent_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_club_newsletters_club ON public.club_newsletters(club_id);

alter table public.club_newsletters enable row level security;

drop policy if exists "Club members view newsletters" ON public.club_newsletters;
create policy "Club members view newsletters"
  ON public.club_newsletters FOR SELECT
  USING (public.is_club_member(club_id));

drop policy if exists "Committee manage newsletters" ON public.club_newsletters;
create policy "Committee manage newsletters"
  ON public.club_newsletters FOR ALL
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

grant select, insert, update, delete on public.club_newsletters TO authenticated;