create table if not exists match_feedback_360 (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  ambiance int check (ambiance between 1 and 5),
  communication int check (communication between 1 and 5),
  satisfaction int check (satisfaction between 1 and 5),
  comment text,
  created_at timestamptz default now(),
  unique(event_id, user_id)
);

alter table match_feedback_360 enable row level security;

create policy "player can insert own" on match_feedback_360 for insert with check (user_id = auth.uid());

create policy "player can update own" on match_feedback_360 for update using (user_id = auth.uid());

create policy "player can view own" on match_feedback_360 for select using (
  user_id = auth.uid()
  or exists (
    select 1 from team_members
    where team_members.team_id = match_feedback_360.team_id
      and team_members.user_id = auth.uid()
      and team_members.role in ('coach', 'owner')
  )
);

create policy "coach can view team" on match_feedback_360 for select using (
  exists (select 1 from team_members where team_members.team_id = match_feedback_360.team_id and team_members.user_id = auth.uid() and team_members.role in ('coach', 'owner'))
);
