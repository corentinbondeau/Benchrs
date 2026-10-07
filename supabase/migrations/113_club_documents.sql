-- 113_club_documents.sql
-- Documents & PV du club : dépôt de documents administratifs (règlement
-- intérieur, PV d'AG, budget voté, comptes-rendus…) consultables par les
-- membres du club.
--
-- Stockage : bucket privé `club_documents`, chemins
-- `club_documents/<club_id>/<uuid>.<ext>` (club = foldername[2]).
-- Upload/delete par le comité, lecture par les membres du club (PII/fichiers
-- sensibles → bucket privé, rendus par URL signée).
--
-- RLS :
--   * club_documents — SELECT par adhésion au club, gestion comité.
--   * storage.objects — SELECT club visible, INSERT/UPDATE/DELETE comité.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'club_documents',
  'club_documents',
  false,
  20971520,
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/png',
    'image/jpeg'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

create table if not exists public.club_documents (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  category text not null default 'autre'
    check (category IN ('reglement', 'pv', 'budget', 'compte_rendu', 'actualite', 'autre')),
  title text not null check (char_length(title) <= 200),
  description text,
  storage_path text not null,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_club_documents_club ON public.club_documents(club_id);

alter table public.club_documents enable row level security;

drop policy if exists "Club members view documents" ON public.club_documents;
create policy "Club members view documents"
  ON public.club_documents FOR SELECT
  USING (public.is_club_member(club_id));

drop policy if exists "Committee manage documents" ON public.club_documents;
create policy "Committee manage documents"
  ON public.club_documents FOR ALL
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

grant select, insert, update, delete ON public.club_documents TO authenticated;

-- ── storage.objects ────────────────────────────────────────────────
drop policy if exists "Club members view club_documents" ON storage.objects;
create policy "Club members view club_documents"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'club_documents'
    AND public.is_club_member((storage.foldername(name))[2]::uuid)
  );

drop policy if exists "Committee upload club_documents" ON storage.objects;
create policy "Committee upload club_documents"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'club_documents'
    AND EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.club_id = (storage.foldername(name))[2]::uuid
        AND cm.user_id = auth.uid()
        AND cm.role = 'comite'
    )
  );

drop policy if exists "Committee update club_documents" ON storage.objects;
create policy "Committee update club_documents"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'club_documents'
    AND EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.club_id = (storage.foldername(name))[2]::uuid
        AND cm.user_id = auth.uid()
        AND cm.role = 'comite'
    )
  );

drop policy if exists "Committee delete club_documents" ON storage.objects;
create policy "Committee delete club_documents"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'club_documents'
    AND EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.club_id = (storage.foldername(name))[2]::uuid
        AND cm.user_id = auth.uid()
        AND cm.role = 'comite'
    )
  );