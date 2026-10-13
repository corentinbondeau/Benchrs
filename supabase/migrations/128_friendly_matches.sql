-- Friendly matches (matchs amicaux) between coaches
CREATE TABLE IF NOT EXISTS public.friendly_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  organizer_id uuid NOT NULL REFERENCES public.profiles(id),
  opponent_club_name text NOT NULL,
  opponent_contact text,
  category text,
  level text,
  match_date date NOT NULL,
  match_time time,
  location_type text NOT NULL CHECK (location_type IN ('home', 'away', 'neutral')),
  venue_address text,
  notes text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'accepted', 'confirmed', 'cancelled', 'declined')),
  accepted_by_team_id uuid REFERENCES public.teams(id),
  accepted_by_coach_id uuid REFERENCES public.profiles(id),
  accepted_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.friendly_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  friendly_id uuid NOT NULL REFERENCES public.friendly_matches(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id),
  coach_id uuid NOT NULL REFERENCES public.profiles(id),
  message text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (friendly_id, team_id)
);

CREATE INDEX IF NOT EXISTS idx_fm_team ON public.friendly_matches(team_id);
CREATE INDEX IF NOT EXISTS idx_fm_date ON public.friendly_matches(match_date);
CREATE INDEX IF NOT EXISTS idx_fm_status ON public.friendly_matches(status);
CREATE INDEX IF NOT EXISTS idx_fp_friendly ON public.friendly_proposals(friendly_id);
CREATE INDEX IF NOT EXISTS idx_fp_team ON public.friendly_proposals(team_id);

ALTER TABLE public.friendly_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friendly_proposals ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- friendly_matches
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='friendly_matches' AND policyname='Coaches read open friendly matches') THEN
    CREATE POLICY "Coaches read open friendly matches" ON public.friendly_matches
      FOR SELECT USING (
        status = 'open'
        OR public.is_team_coach(team_id)
        OR (accepted_by_team_id IS NOT NULL AND public.is_team_coach(accepted_by_team_id))
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='friendly_matches' AND policyname='Coaches manage their friendly matches') THEN
    CREATE POLICY "Coaches manage their friendly matches" ON public.friendly_matches
      FOR ALL USING (public.is_team_coach(team_id))
      WITH CHECK (public.is_team_coach(team_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='friendly_matches' AND policyname='Coaches can update accepted side') THEN
    CREATE POLICY "Coaches can update accepted side" ON public.friendly_matches
      FOR UPDATE USING (
        public.is_team_coach(accepted_by_team_id)
        OR public.is_team_coach(team_id)
      );
  END IF;

  -- friendly_proposals
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='friendly_proposals' AND policyname='Coaches read proposals for their friendly or their proposals') THEN
    CREATE POLICY "Coaches read proposals for their friendly or their proposals" ON public.friendly_proposals
      FOR SELECT USING (
        public.is_team_coach(team_id)
        OR EXISTS (
          SELECT 1 FROM public.friendly_matches fm
          WHERE fm.id = friendly_proposals.friendly_id
            AND public.is_team_coach(fm.team_id)
        )
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='friendly_proposals' AND policyname='Coaches manage their proposals') THEN
    CREATE POLICY "Coaches manage their proposals" ON public.friendly_proposals
      FOR ALL USING (public.is_team_coach(team_id))
      WITH CHECK (public.is_team_coach(team_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='friendly_proposals' AND policyname='Organizer can manage proposals') THEN
    CREATE POLICY "Organizer can manage proposals" ON public.friendly_proposals
      FOR ALL USING (
        EXISTS (
          SELECT 1 FROM public.friendly_matches fm
          WHERE fm.id = friendly_proposals.friendly_id
            AND public.is_team_coach(fm.team_id)
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.friendly_matches fm
          WHERE fm.id = friendly_proposals.friendly_id
            AND public.is_team_coach(fm.team_id)
        )
      );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS set_fm_updated_at ON public.friendly_matches;
CREATE TRIGGER set_fm_updated_at
  BEFORE UPDATE ON public.friendly_matches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_fp_updated_at ON public.friendly_proposals;
CREATE TRIGGER set_fp_updated_at
  BEFORE UPDATE ON public.friendly_proposals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


