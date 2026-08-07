-- ============================================================
-- 040_season_cycles.sql
-- Plan de saison : cycles (préparation / compétition / athlétisation)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.season_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  cycle_type TEXT NOT NULL CHECK (cycle_type IN ('preparation', 'competition', 'athletisation')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  notes TEXT,
  season TEXT DEFAULT (
    (extract(year from now())::int)::text || '-' || ((extract(year from now())::int + 1)::text)
  ),
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);

CREATE UNIQUE INDEX IF NOT EXISTS season_cycles_team_name_unique
  ON public.season_cycles(team_id, name);

CREATE INDEX IF NOT EXISTS idx_season_cycles_team ON public.season_cycles(team_id);
CREATE INDEX IF NOT EXISTS idx_season_cycles_dates ON public.season_cycles(start_date, end_date);

-- Les événements (matchs / entraînements) et les fiches de séance
-- peuvent être rattachés à un cycle.
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS cycle_id UUID
  REFERENCES public.season_cycles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_events_cycle ON public.events(cycle_id);

ALTER TABLE public.training_sessions ADD COLUMN IF NOT EXISTS cycle_id UUID
  REFERENCES public.season_cycles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_training_sessions_cycle ON public.training_sessions(cycle_id);

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE public.season_cycles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view season_cycles" ON public.season_cycles;
CREATE POLICY "Members can view season_cycles"
  ON public.season_cycles FOR SELECT
  USING (team_id IN (SELECT public.user_team_ids()));

DROP POLICY IF EXISTS "Coaches can manage season_cycles" ON public.season_cycles;
CREATE POLICY "Coaches can manage season_cycles"
  ON public.season_cycles FOR ALL
  USING (public.is_team_coach(team_id))
  WITH CHECK (public.is_team_coach(team_id));
