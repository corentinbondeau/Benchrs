-- 045_rpe_tracking.sql
-- Suivi de charge (RPE) : après chaque séance, les joueurs notent l'intensité perçue (1-10).
-- Charge = RPE × durée (min). Table team_settings.enable_rpe activable par les coachs (params équipe).

CREATE TABLE IF NOT EXISTS public.team_settings (
  team_id UUID PRIMARY KEY REFERENCES public.teams(id) ON DELETE CASCADE,
  enable_rpe BOOLEAN NOT NULL DEFAULT false,
  updated_by UUID REFERENCES public.profiles(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.team_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view team_settings" ON public.team_settings;
CREATE POLICY "Members can view team_settings"
  ON public.team_settings FOR SELECT
  USING (team_id IN (SELECT public.user_team_ids()));

DROP POLICY IF EXISTS "Coaches can manage team_settings" ON public.team_settings;
CREATE POLICY "Coaches can manage team_settings"
  ON public.team_settings FOR ALL
  USING (public.is_team_coach(team_id))
  WITH CHECK (public.is_team_coach(team_id));

CREATE TABLE IF NOT EXISTS public.session_rpe (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  rpe INTEGER NOT NULL CHECK (rpe >= 1 AND rpe <= 10),
  session_duration INTEGER CHECK (session_duration > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_session_rpe_event ON public.session_rpe(event_id);
CREATE INDEX IF NOT EXISTS idx_session_rpe_player ON public.session_rpe(player_id);
CREATE INDEX IF NOT EXISTS idx_session_rpe_team_event ON public.session_rpe(team_id, event_id);

ALTER TABLE public.session_rpe ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view session_rpe" ON public.session_rpe;
CREATE POLICY "Members can view session_rpe"
  ON public.session_rpe FOR SELECT
  USING (team_id IN (SELECT public.user_team_ids()));

DROP POLICY IF EXISTS "Players can manage own session_rpe" ON public.session_rpe;
CREATE POLICY "Players can manage own session_rpe"
  ON public.session_rpe FOR ALL
  USING (auth.uid() = player_id)
  WITH CHECK (auth.uid() = player_id);
