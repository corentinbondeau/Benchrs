-- Player unavailability periods (block convocations during these periods)
CREATE TABLE IF NOT EXISTS public.player_unavailability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  reason text,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT player_unavailability_dates_check CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_player_unavailability_team ON public.player_unavailability(team_id);
CREATE INDEX IF NOT EXISTS idx_player_unavailability_player ON public.player_unavailability(player_id);
CREATE INDEX IF NOT EXISTS idx_player_unavailability_dates ON public.player_unavailability(start_date, end_date);

ALTER TABLE public.player_unavailability ENABLE ROW LEVEL SECURITY;

-- RLS: player can manage own, parent linked can manage, coach can manage/read team
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='player_unavailability' AND policyname='Players manage own unavailability'
  ) THEN
    CREATE POLICY "Players manage own unavailability" ON public.player_unavailability
      FOR ALL USING (auth.uid() = player_id)
      WITH CHECK (auth.uid() = player_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='player_unavailability' AND policyname='Parents manage linked child unavailability'
  ) THEN
    CREATE POLICY "Parents manage linked child unavailability" ON public.player_unavailability
      FOR ALL USING (
        EXISTS (
          SELECT 1 FROM public.parent_student ps
          WHERE ps.parent_id = auth.uid()
            AND ps.student_id = player_unavailability.player_id
            AND ps.team_id = player_unavailability.team_id
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.parent_student ps
          WHERE ps.parent_id = auth.uid()
            AND ps.student_id = player_unavailability.player_id
            AND ps.team_id = player_unavailability.team_id
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='player_unavailability' AND policyname='Coaches read team unavailability'
  ) THEN
    CREATE POLICY "Coaches read team unavailability" ON public.player_unavailability
      FOR SELECT USING (public.is_team_coach(team_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='player_unavailability' AND policyname='Coaches manage team unavailability'
  ) THEN
    CREATE POLICY "Coaches manage team unavailability" ON public.player_unavailability
      FOR ALL USING (public.is_team_coach(team_id))
      WITH CHECK (public.is_team_coach(team_id));
  END IF;
END $$;

-- Ensure updated_at trigger function exists
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- updated_at trigger
DROP TRIGGER IF EXISTS set_player_unavailability_updated_at ON public.player_unavailability;
CREATE TRIGGER set_player_unavailability_updated_at
  BEFORE UPDATE ON public.player_unavailability
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

