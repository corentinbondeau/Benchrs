-- 121_club_ideas.sql
-- Boîte à idées du club : les membres proposent des idées, tout le club vote,
-- le comité suit le statut (proposée / retenue / en cours / réalisée / refusée).
--
-- RLS :
--   * club_ideas — SELECT par adhésion au club, INSERT = auteur membre,
--     UPDATE/DELETE = comité OU auteur (chacun peut retirer son idée).
--   * club_idea_votes — un membre vote une seule fois par idée (UNIQUE),
--     chacun ne gère que SA ligne.

create table if not exists public.club_ideas (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) <= 140),
  description text not null check (char_length(description) <= 2000),
  status text not null default 'proposed'
    check (status IN ('proposed', 'selected', 'in_progress', 'done', 'rejected')),
  created_at timestamptz not null default now()
);

create table if not exists public.club_idea_votes (
  idea_id uuid not null references public.club_ideas(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (idea_id, user_id)
);

create index if not exists idx_club_ideas_club ON public.club_ideas(club_id);
create index if not exists idx_club_idea_votes_idea ON public.club_idea_votes(idea_id);

alter table public.club_ideas enable row level security;
alter table public.club_idea_votes enable row level security;

-- club_ideas
drop policy if exists "Club members view ideas" ON public.club_ideas;
create policy "Club members view ideas"
  ON public.club_ideas FOR SELECT
  USING (public.is_club_member(club_id));

drop policy if exists "Club members propose ideas" ON public.club_ideas;
create policy "Club members propose ideas"
  ON public.club_ideas FOR INSERT
  WITH CHECK (
    public.is_club_member(club_id)
    AND user_id = auth.uid()
  );

drop policy if exists "Committee or author update ideas" ON public.club_ideas;
create policy "Committee or author update ideas"
  ON public.club_ideas FOR UPDATE
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.club_id = club_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'comite'
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.club_id = club_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'comite'
    )
  );

drop policy if exists "Committee or author delete ideas" ON public.club_ideas;
create policy "Committee or author delete ideas"
  ON public.club_ideas FOR DELETE
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.club_id = club_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'comite'
    )
  );

-- club_idea_votes
drop policy if exists "Club members view idea votes" ON public.club_idea_votes;
create policy "Club members view idea votes"
  ON public.club_idea_votes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.club_ideas i
      WHERE i.id = idea_id
        AND public.is_club_member(i.club_id)
    )
  );

drop policy if exists "Members manage own idea votes" ON public.club_idea_votes;
create policy "Members manage own idea votes"
  ON public.club_idea_votes FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.club_ideas i
      WHERE i.id = idea_id
        AND public.is_club_member(i.club_id)
    )
  );

drop policy if exists "Members delete own idea vote" ON public.club_idea_votes;
create policy "Members delete own idea vote"
  ON public.club_idea_votes FOR DELETE
  USING (user_id = auth.uid());

grant select, insert, update, delete ON public.club_ideas TO authenticated;
grant select, insert, delete ON public.club_idea_votes TO authenticated;