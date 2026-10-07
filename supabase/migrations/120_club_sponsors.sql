-- 120_club_sponsors.sql
-- Partenaires & sponsors du club : encart « Nos partenaires » consultable par
-- les familles, géré par le comité.
--
-- Stockage : bucket privé `club_sponsors`, chemins
-- `club_sponsors/<club_id>/<uuid>.<ext>` (club = foldername[2]).
-- Upload/update/delete par le comité, lecture par les membres du club.
--
-- RLS :
--   * club_sponsors — SELECT par adhésion au club, gestion comité.
--   * storage.objects — SELECT club visible, INSERT/UPDATE/DELETE comité.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'club_sponsors',
  'club_sponsors',
  false,
  5242880,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

create table if not exists public.club_sponsors (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  name text not null check (char_length(name) <= 120),
  sponsor_type text not null default 'autre'
    check (sponsor_type IN ('commercant', 'institutionnel', 'club', 'autre')),
  amount numeric(10,2) not null default 0,
  season text,
  start_date date,
  end_date date,
  website text check (website IS NULL OR char_length(website) <= 300),
  logo_path text,
  sort_order integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_club_sponsors_club ON public.club_sponsors(club_id);

alter table public.club_sponsors enable row level security;

drop policy if exists "Club members view sponsors" ON public.club_sponsors;
create policy "Club members view sponsors"
  ON public.club_sponsors FOR SELECT
  USING (public.is_club_member(club_id));

drop policy if exists "Committee manage sponsors" ON public.club_sponsors;
create policy "Committee manage sponsors"
  ON public.club_sponsors FOR ALL
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

grant select, insert, update, delete ON public.club_sponsors TO authenticated;

-- ── storage.objects ────────────────────────────────────────────────
drop policy if exists "Club members view club_sponsors" ON storage.objects;
create policy "Club members view club_sponsors"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'club_sponsors'
    AND public.is_club_member((storage.foldername(name))[2]::uuid)
  );

drop policy if exists "Committee upload club_sponsors" ON storage.objects;
create policy "Committee upload club_sponsors"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'club_sponsors'
    AND EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.club_id = (storage.foldername(name))[2]::uuid
        AND cm.user_id = auth.uid()
        AND cm.role = 'comite'
    )
  );

drop policy if exists "Committee update club_sponsors" ON storage.objects;
create policy "Committee update club_sponsors"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'club_sponsors'
    AND EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.club_id = (storage.foldername(name))[2]::uuid
        AND cm.user_id = auth.uid()
        AND cm.role = 'comite'
    )
  );

drop policy if exists "Committee delete club_sponsors" ON storage.objects;
create policy "Committee delete club_sponsors"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'club_sponsors'
    AND EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.club_id = (storage.foldername(name))[2]::uuid
        AND cm.user_id = auth.uid()
        AND cm.role = 'comite'
    )
  );