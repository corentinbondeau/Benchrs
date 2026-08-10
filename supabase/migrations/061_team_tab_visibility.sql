-- 061_team_tab_visibility.sql
-- Visibilité des onglets/navigation d'équipe : les coachs choisissent quels onglets
-- de la navigation (Sidebar / menu mobile) sont visibles par toute l'équipe.
-- Par défaut : tous les onglets visibles (aucune ligne => visible).

CREATE TABLE IF NOT EXISTS public.team_tab_visibility (
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  tab_key TEXT NOT NULL,
  visible BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, tab_key)
);

ALTER TABLE public.team_tab_visibility ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view team_tab_visibility" ON public.team_tab_visibility;
CREATE POLICY "Members can view team_tab_visibility"
  ON public.team_tab_visibility FOR SELECT
  USING (team_id IN (SELECT public.user_team_ids()));

DROP POLICY IF EXISTS "Coaches can manage team_tab_visibility" ON public.team_tab_visibility;
CREATE POLICY "Coaches can manage team_tab_visibility"
  ON public.team_tab_visibility FOR ALL
  USING (public.is_team_coach(team_id))
  WITH CHECK (public.is_team_coach(team_id));
