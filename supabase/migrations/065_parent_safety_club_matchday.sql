-- 065 : Fiche d'urgence (profiles), « On est parti » (events), terrains & créneaux (club),
--       mutations entre équipes (club), ordre du jour de match, tournois (week-end)

-- ============================================================
-- 1. Fiche d'urgence (profiles) : allergies, licence, contacts d'urgence
-- ============================================================
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS allergies TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS licence_number TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS emergency_contacts JSONB;

-- RPC coach/parent-scoped pour éditer la fiche d'urgence (RLS profiles UPDATE = self only)
CREATE OR REPLACE FUNCTION public.update_player_emergency(
  p_player_id uuid,
  p_allergies text,
  p_licence_number text,
  p_emergency_contacts jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Le demandeur doit être un coach/owner de la même équipe QUE LE JOUEUR,
  -- un parent lié au joueur, ou le joueur lui-même.
  IF NOT (
    auth.uid() = p_player_id
    OR EXISTS (
      SELECT 1 FROM public.team_members tm
      JOIN public.team_members me ON me.team_id = tm.team_id
      WHERE tm.user_id = p_player_id
        AND me.user_id = auth.uid()
        AND me.role IN ('owner','coach')
      LIMIT 1
    )
    OR EXISTS (
      SELECT 1 FROM public.parent_student ps
      WHERE ps.student_id = p_player_id AND ps.parent_id = auth.uid()
      LIMIT 1
    )
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.profiles
  SET allergies = p_allergies,
      licence_number = p_licence_number,
      emergency_contacts = p_emergency_contacts,
      updated_at = now()
  WHERE id = p_player_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.update_player_emergency(uuid, text, text, jsonb) TO authenticated;

-- ============================================================
-- 2. « On est parti » / « Arrivés au stade » (events)
-- ============================================================
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS departure_notified_at TIMESTAMPTZ;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS arrival_notified_at TIMESTAMPTZ;

-- ============================================================
-- 3. Terrains & créneaux (niveau club)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.pitches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  location TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (club_id, name)
);
CREATE INDEX IF NOT EXISTS idx_pitches_club ON public.pitches(club_id);
ALTER TABLE public.pitches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Club members view pitches" ON public.pitches
  FOR SELECT USING (club_id IN (SELECT public.user_club_ids()));
CREATE POLICY "Committee manage pitches" ON public.pitches
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.club_members WHERE club_id = public.pitches.club_id AND user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.club_members WHERE club_id = public.pitches.club_id AND user_id = auth.uid())
  );
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pitches TO authenticated;

CREATE TABLE IF NOT EXISTS public.pitch_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pitch_id UUID NOT NULL REFERENCES public.pitches(id) ON DELETE CASCADE,
  club_id UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE,
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  label TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pitch_bookings_club ON public.pitch_bookings(club_id);
CREATE INDEX IF NOT EXISTS idx_pitch_bookings_pitch ON public.pitch_bookings(pitch_id);
ALTER TABLE public.pitch_bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Club members view pitch bookings" ON public.pitch_bookings
  FOR SELECT USING (club_id IN (SELECT public.user_club_ids()));
CREATE POLICY "Committee manage pitch bookings" ON public.pitch_bookings
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.club_members WHERE club_id = public.pitch_bookings.club_id AND user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.club_members WHERE club_id = public.pitch_bookings.club_id AND user_id = auth.uid())
  );
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pitch_bookings TO authenticated;

-- ============================================================
-- 4. Mutations entre équipes (niveau club, validées par le comité)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.player_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  from_team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  to_team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  notes TEXT,
  requested_by UUID REFERENCES public.profiles(id),
  reviewed_by UUID REFERENCES public.profiles(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_player_transfers_club ON public.player_transfers(club_id);
CREATE INDEX IF NOT EXISTS idx_player_transfers_player ON public.player_transfers(player_id);
ALTER TABLE public.player_transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Club members view transfers" ON public.player_transfers
  FOR SELECT USING (
    club_id IN (SELECT public.user_club_ids())
    OR from_team_id IN (SELECT public.user_team_ids())
    OR to_team_id IN (SELECT public.user_team_ids())
  );
CREATE POLICY "Coaches request transfers" ON public.player_transfers
  FOR INSERT WITH CHECK (
    status = 'pending'
    AND public.is_team_coach(from_team_id)
    AND (to_team_id IN (SELECT public.user_visible_team_ids()))
  );
CREATE POLICY "Committee review transfers" ON public.player_transfers
  FOR UPDATE USING (
    status = 'pending'
    AND club_id IN (SELECT public.user_club_ids())
  ) WITH CHECK (status IN ('approved','rejected'));
GRANT SELECT, INSERT, UPDATE ON public.player_transfers TO authenticated;

-- RPC d'approbation par le comité : met à jour le statut ET déplace le joueur
-- (RLS team_members = coach-scoped, donc sécurité definer + check comité explicite)
CREATE OR REPLACE FUNCTION public.approve_player_transfer(p_transfer_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_club_id uuid;
  v_player_id uuid;
  v_from uuid;
  v_to uuid;
BEGIN
  SELECT club_id, player_id, from_team_id, to_team_id
    INTO v_club_id, v_player_id, v_from, v_to
  FROM public.player_transfers
  WHERE id = p_transfer_id AND status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Demande de mutation introuvable ou déjà traitée';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.club_members
    WHERE club_id = v_club_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  DELETE FROM public.team_members WHERE team_id = v_from AND user_id = v_player_id;
  INSERT INTO public.team_members (team_id, user_id, role)
  VALUES (v_to, v_player_id, 'player')
  ON CONFLICT (team_id, user_id) DO NOTHING;

  UPDATE public.player_transfers
  SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
  WHERE id = p_transfer_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.approve_player_transfer(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.reject_player_transfer(p_transfer_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_club_id uuid;
BEGIN
  SELECT club_id INTO v_club_id FROM public.player_transfers
  WHERE id = p_transfer_id AND status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Demande de mutation introuvable ou déjà traitée';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.club_members
    WHERE club_id = v_club_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.player_transfers
  SET status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now()
  WHERE id = p_transfer_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.reject_player_transfer(uuid) TO authenticated;

-- ============================================================
-- 5. Ordre du jour de match (timeline rdv/échauffement/causerie/coup d'envoi)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.match_agenda_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  agenda_time TIME,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_agenda_items_event ON public.match_agenda_items(event_id);
ALTER TABLE public.match_agenda_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view agenda items" ON public.match_agenda_items
  FOR SELECT USING (team_id IN (SELECT public.user_visible_team_ids()));
CREATE POLICY "Coaches manage agenda items" ON public.match_agenda_items
  FOR ALL USING (public.is_team_coach(team_id)) WITH CHECK (public.is_team_coach(team_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.match_agenda_items TO authenticated;

-- ============================================================
-- 6. Tournois (week-end : matches, horaires, cantine) envoyés aux familles
-- ============================================================
CREATE TABLE IF NOT EXISTS public.tournaments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  location TEXT,
  notes TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tournaments_team ON public.tournaments(team_id);
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view tournaments" ON public.tournaments
  FOR SELECT USING (team_id IN (SELECT public.user_visible_team_ids()));
CREATE POLICY "Coaches manage tournaments" ON public.tournaments
  FOR ALL USING (public.is_team_coach(team_id)) WITH CHECK (public.is_team_coach(team_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tournaments TO authenticated;

CREATE TABLE IF NOT EXISTS public.tournament_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  opponent TEXT NOT NULL,
  match_datetime TIMESTAMPTZ NOT NULL,
  venue TEXT,
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tournament_matches_tournament ON public.tournament_matches(tournament_id);
ALTER TABLE public.tournament_matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view tournament matches" ON public.tournament_matches
  FOR SELECT USING (team_id IN (SELECT public.user_visible_team_ids()));
CREATE POLICY "Coaches manage tournament matches" ON public.tournament_matches
  FOR ALL USING (public.is_team_coach(team_id)) WITH CHECK (public.is_team_coach(team_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tournament_matches TO authenticated;
