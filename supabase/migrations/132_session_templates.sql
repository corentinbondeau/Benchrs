create table if not exists session_templates (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  club_id uuid references clubs(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  title text not null,
  phase text not null,
  objective text,
  expertise text default 'UEFA B',
  session_data jsonb not null,
  is_shared boolean default false,
  usage_count int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table session_templates enable row level security;

create policy "members can view team templates" on session_templates for select using (
  exists (select 1 from team_members where team_members.team_id = session_templates.team_id and team_members.user_id = auth.uid())
);

create policy "coaches can insert" on session_templates for insert with check (
  exists (select 1 from team_members where team_members.team_id = session_templates.team_id and team_members.user_id = auth.uid() and team_members.role in ('coach', 'owner'))
);

create policy "creator can update" on session_templates for update using (created_by = auth.uid());

create policy "creator can delete" on session_templates for delete using (created_by = auth.uid());
