-- 115_equipment_orders.sql
-- Commandes groupées d'équipement (maillots, survêtements…) :
--   * le comité crée une commande (title, saison, statut, date de clôture) et
--     y attache des articles (nom + liste de tailles proposées) ;
--   * chaque membre du club choisit une taille par article et par joueur
--     (le joueur est un profils de l'une des équipes du club, ou un enfant
--     lié `parent_student`) ;
--   * le comité consulte la synthèse des tailles et passe la commande en
--     « livrée » une fois la distribution faite.
--
-- RLS : lecture par adhésion au club (`is_club_member`, 111) ; gestion des
-- commandes/articles = comité ; chaque membre ne gère QUE ses propres choix
-- (un parent peut choisir pour ses enfants liés).

create table if not exists public.equipment_orders (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  title text not null check (char_length(title) <= 150),
  season text,
  status text not null default 'draft'
    check (status in ('draft', 'open', 'closed', 'delivered', 'cancelled')),
  description text,
  closes_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.equipment_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.equipment_orders(id) on delete cascade,
  name text not null check (char_length(name) <= 120),
  sizes text[] not null default '{}',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.equipment_choices (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.equipment_orders(id) on delete cascade,
  item_id uuid not null references public.equipment_items(id) on delete cascade,
  player_id uuid references public.profiles(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  size text not null check (char_length(size) <= 30),
  quantity integer not null default 1 check (quantity between 1 and 10),
  note text,
  created_at timestamptz not null default now(),
  unique (order_id, item_id, player_id, user_id)
);

create index if not exists idx_equipment_orders_club ON public.equipment_orders(club_id);
create index if not exists idx_equipment_items_order ON public.equipment_items(order_id);
create index if not exists idx_equipment_choices_order ON public.equipment_choices(order_id);

alter table public.equipment_orders enable row level security;
alter table public.equipment_items enable row level security;
alter table public.equipment_choices enable row level security;

-- Commandes
drop policy if exists "Club members view equipment orders" ON public.equipment_orders;
create policy "Club members view equipment orders"
  ON public.equipment_orders FOR SELECT
  USING (public.is_club_member(club_id));

drop policy if exists "Committee manage equipment orders" ON public.equipment_orders;
create policy "Committee manage equipment orders"
  ON public.equipment_orders FOR ALL
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

-- Articles (via la commande)
drop policy if exists "Club members view equipment items" ON public.equipment_items;
create policy "Club members view equipment items"
  ON public.equipment_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.equipment_orders o
      WHERE o.id = order_id AND public.is_club_member(o.club_id)
    )
  );

drop policy if exists "Committee manage equipment items" ON public.equipment_items;
create policy "Committee manage equipment items"
  ON public.equipment_items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.equipment_orders o
      JOIN public.club_members cm ON cm.club_id = o.club_id
      WHERE o.id = order_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'comite'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.equipment_orders o
      JOIN public.club_members cm ON cm.club_id = o.club_id
      WHERE o.id = order_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'comite'
    )
  );

-- Choix : lecture par adhésion, gestion du comité OU de soi-même (ou de ses enfants)
drop policy if exists "Club members view equipment choices" ON public.equipment_choices;
create policy "Club members view equipment choices"
  ON public.equipment_choices FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.equipment_orders o
      WHERE o.id = order_id AND public.is_club_member(o.club_id)
    )
  );

drop policy if exists "Committee manage equipment choices" ON public.equipment_choices;
create policy "Committee manage equipment choices"
  ON public.equipment_choices FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.equipment_orders o
      JOIN public.club_members cm ON cm.club_id = o.club_id
      WHERE o.id = order_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'comite'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.equipment_orders o
      JOIN public.club_members cm ON cm.club_id = o.club_id
      WHERE o.id = order_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'comite'
    )
  );

drop policy if exists "Members insert own equipment choice" ON public.equipment_choices;
create policy "Members insert own equipment choice"
  ON public.equipment_choices FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.equipment_orders o
      WHERE o.id = order_id AND public.is_club_member(o.club_id)
    )
    AND (
      player_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.equipment_orders o
        JOIN public.teams t ON t.club_id = o.club_id
        JOIN public.team_members tm ON tm.team_id = t.id
        WHERE o.id = order_id AND tm.user_id = player_id AND tm.role = 'player'
      )
      OR EXISTS (
        SELECT 1
        FROM public.equipment_orders o
        JOIN public.teams t ON t.club_id = o.club_id
        JOIN public.team_members tm ON tm.team_id = t.id
        JOIN public.parent_student ps
          ON ps.student_id = tm.user_id AND ps.parent_id = user_id
        WHERE o.id = order_id AND tm.user_id = player_id AND tm.role = 'player'
      )
    )
  );

drop policy if exists "Members update own equipment choice" ON public.equipment_choices;
create policy "Members update own equipment choice"
  ON public.equipment_choices FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

drop policy if exists "Members delete own equipment choice" ON public.equipment_choices;
create policy "Members delete own equipment choice"
  ON public.equipment_choices FOR DELETE
  USING (auth.uid() = user_id);

grant select, insert, update, delete on public.equipment_orders TO authenticated;
grant select, insert, update, delete on public.equipment_items TO authenticated;
grant select, insert, update, delete on public.equipment_choices TO authenticated;