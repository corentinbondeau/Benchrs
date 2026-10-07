-- 122_club_album.sql
-- Album souvenirs du club : photos du club par équipe avec légendes, les
-- familles uploadent et commentent.
--
-- Stockage : bucket privé `club_album`, chemins
-- `club_album/<club_id>/<user_id>/<uuid>.<ext>` (club = foldername[2],
-- utilisateur = foldername[3]).
-- Upload par les membres du club, suppression de SON upload (ou comité).
--
-- RLS :
--   * club_album_photos — SELECT par adhésion au club, INSERT = uploader
--     membre, UPDATE/DELETE = uploader OU comité.
--   * club_album_comments — visible par adhésion, chacun gère ses
--     commentaires, le comité peut modérer (DELETE).
--   * storage.objects — SELECT club visible, INSERT membre, UPDATE/DELETE =
--     propriétaire du dossier OU comité du club.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'club_album',
  'club_album',
  false,
  20971520,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/heic']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

create table if not exists public.club_album_photos (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  team_id uuid references public.teams(id) on delete set null,
  uploaded_by uuid not null references public.profiles(id) on delete cascade,
  caption text check (caption IS NULL OR char_length(caption) <= 300),
  taken_at date,
  storage_path text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.club_album_comments (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid not null references public.club_album_photos(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(content) <= 500),
  created_at timestamptz not null default now()
);

create index if not exists idx_club_album_club ON public.club_album_photos(club_id);
create index if not exists idx_club_album_team ON public.club_album_photos(team_id);
create index if not exists idx_club_album_comments_photo ON public.club_album_comments(photo_id);

alter table public.club_album_photos enable row level security;
alter table public.club_album_comments enable row level security;

-- club_album_photos
drop policy if exists "Club members view album photos" ON public.club_album_photos;
create policy "Club members view album photos"
  ON public.club_album_photos FOR SELECT
  USING (public.is_club_member(club_id));

drop policy if exists "Club members upload album photos" ON public.club_album_photos;
create policy "Club members upload album photos"
  ON public.club_album_photos FOR INSERT
  WITH CHECK (
    public.is_club_member(club_id)
    AND uploaded_by = auth.uid()
  );

drop policy if exists "Uploader or committee update album photos" ON public.club_album_photos;
create policy "Uploader or committee update album photos"
  ON public.club_album_photos FOR UPDATE
  USING (
    uploaded_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.club_id = club_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'comite'
    )
  )
  WITH CHECK (
    uploaded_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.club_id = club_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'comite'
    )
  );

drop policy if exists "Uploader or committee delete album photos" ON public.club_album_photos;
create policy "Uploader or committee delete album photos"
  ON public.club_album_photos FOR DELETE
  USING (
    uploaded_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.club_id = club_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'comite'
    )
  );

-- club_album_comments
drop policy if exists "Club members view album comments" ON public.club_album_comments;
create policy "Club members view album comments"
  ON public.club_album_comments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.club_album_photos p
      WHERE p.id = photo_id
        AND public.is_club_member(p.club_id)
    )
  );

drop policy if exists "Members comment album" ON public.club_album_comments;
create policy "Members comment album"
  ON public.club_album_comments FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.club_album_photos p
      WHERE p.id = photo_id
        AND public.is_club_member(p.club_id)
    )
  );

drop policy if exists "Author or committee delete album comments" ON public.club_album_comments;
create policy "Author or committee delete album comments"
  ON public.club_album_comments FOR DELETE
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.club_album_photos p
        JOIN public.club_members cm ON cm.club_id = p.club_id
      WHERE p.id = photo_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'comite'
    )
  );

grant select, insert, update, delete ON public.club_album_photos TO authenticated;
grant select, insert, delete ON public.club_album_comments TO authenticated;

-- ── storage.objects ────────────────────────────────────────────────
drop policy if exists "Club members view club_album" ON storage.objects;
create policy "Club members view club_album"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'club_album'
    AND public.is_club_member((storage.foldername(name))[2]::uuid)
  );

drop policy if exists "Club members upload club_album" ON storage.objects;
create policy "Club members upload club_album"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'club_album'
    AND public.is_club_member((storage.foldername(name))[2]::uuid)
  );

drop policy if exists "Uploader or committee update club_album" ON storage.objects;
create policy "Uploader or committee update club_album"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'club_album'
    AND (storage.foldername(name))[3]::uuid = auth.uid()
    OR (
      bucket_id = 'club_album'
      AND EXISTS (
        SELECT 1 FROM public.club_members cm
        WHERE cm.club_id = (storage.foldername(name))[2]::uuid
          AND cm.user_id = auth.uid()
          AND cm.role = 'comite'
      )
    )
  );

drop policy if exists "Uploader or committee delete club_album" ON storage.objects;
create policy "Uploader or committee delete club_album"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'club_album'
    AND (storage.foldername(name))[3]::uuid = auth.uid()
    OR (
      bucket_id = 'club_album'
      AND EXISTS (
        SELECT 1 FROM public.club_members cm
        WHERE cm.club_id = (storage.foldername(name))[2]::uuid
          AND cm.user_id = auth.uid()
          AND cm.role = 'comite'
      )
    )
  );