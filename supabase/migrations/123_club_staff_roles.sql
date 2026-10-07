-- 123_club_staff_roles.sql
-- Arbre des catégories : organigramme des responsables de chaque équipe
-- (adjoint, délégué de plateau, soigneur…) en complément du coach titulaire
-- (déjà connu via team_members). Imprimable, coordonnées affichées côté club.
--
-- RLS :
--   * SELECT — comité du club de l'équipe (toutes équipes, PII téléphone des
--     profils join en lecture) OU membre de l'équipe (sa catégorie).
--   * INSERT/UPDATE/DELETE — comité du club OU coach/owner de l'équipe
--     (public.is_team_coach, SECURITY DEFINER — jamais de sous-query brute
--     sur la table protégée).

create table if not exists public.club_staff_roles (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  staff_role text not null default 'adjoint'
    check (staff_role IN ('adjoint', 'delegue', 'physio', 'intendant', 'autre')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (team_id, user_id)
);

create index if not exists idx_club_staff_roles_team ON public.club_staff_roles(team_id);

alter table public.club_staff_roles enable row level security;

drop policy if exists "Club committee or team members view staff roles" ON public.club_staff_roles;
create policy "Club committee or team members view staff roles"
  ON public.club_staff_roles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.teams t
      WHERE t.id = team_id
        AND EXISTS (
          SELECT 1 FROM public.club_members cm
          WHERE cm.club_id = t.club_id
            AND cm.user_id = auth.uid()
            AND cm.role = 'comite'
        )
    )
    OR EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.team_id = team_id
        AND tm.user_id = auth.uid()
    )
  );

drop policy if exists "Committee or team coach manage staff roles" ON public.club_staff_roles;
create policy "Committee or team coach manage staff roles"
  ON public.club_staff_roles FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.teams t
      WHERE t.id = team_id
        AND EXISTS (
          SELECT 1 FROM public.club_members cm
          WHERE cm.club_id = t.club_id
            AND cm.user_id = auth.uid()
            AND cm.role = 'comite'
        )
    )
    OR public.is_team_coach(team_id)
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.teams t
      WHERE t.id = team_id
        AND EXISTS (
          SELECT 1 FROM public.club_members cm
          WHERE cm.club_id = t.club_id
            AND cm.user_id = auth.uid()
            AND cm.role = 'comite'
        )
    )
    OR public.is_team_coach(team_id)
  );

grant select, insert, update, delete ON public.club_staff_roles TO authenticated;