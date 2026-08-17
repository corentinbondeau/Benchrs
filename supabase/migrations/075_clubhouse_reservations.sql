-- 075 : Calendrier de réservation du Club House (niveau club)
--       Les coachs et membres du comité peuvent réserver des créneaux dans le
--       club house. La contrainte EXCLUDE empêche les chevauchements de créneaux
--       sur un même club et une même date.

-- Extension nécessaire pour la contrainte d'exclusion sur des plages horaires
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ============================================================
-- Table principale : réservations du club house
-- ============================================================
CREATE TABLE IF NOT EXISTS public.clubhouse_reservations (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id          UUID        NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  title            TEXT        NOT NULL,
  description      TEXT,
  reservation_date DATE        NOT NULL,
  start_time       TIME        NOT NULL,
  end_time         TIME        NOT NULL,
  created_by       UUID        NOT NULL REFERENCES public.profiles(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Les créneaux doivent être cohérents (début < fin)
  CONSTRAINT chk_clubhouse_time_order CHECK (start_time < end_time),

  -- Pas de chevauchement de créneaux sur un même club et une même date
  -- tsrange est converti depuis DATE + TIME pour utiliser l'opérateur &&
  CONSTRAINT excl_clubhouse_no_overlap
    EXCLUDE USING gist (
      club_id WITH =,
      reservation_date WITH =,
      tsrange(
        (reservation_date + start_time)::timestamp,
        (reservation_date + end_time)::timestamp
      ) WITH &&
    )
);

-- ============================================================
-- Index de performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_clubhouse_reservations_club
  ON public.clubhouse_reservations(club_id);

CREATE INDEX IF NOT EXISTS idx_clubhouse_reservations_date
  ON public.clubhouse_reservations(club_id, reservation_date);

-- ============================================================
-- Row Level Security
-- ============================================================
ALTER TABLE public.clubhouse_reservations ENABLE ROW LEVEL SECURITY;

-- SELECT : accessible à tous les membres du club (coachs + comité)
CREATE POLICY "Club members view clubhouse reservations"
  ON public.clubhouse_reservations
  FOR SELECT
  USING (club_id IN (SELECT public.user_club_ids()));

-- INSERT : réservé aux coachs et membres du comité
CREATE POLICY "Club staff create clubhouse reservations"
  ON public.clubhouse_reservations
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.club_members
      WHERE club_id = public.clubhouse_reservations.club_id
        AND user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.team_members tm
      JOIN public.teams t ON t.id = tm.team_id
      WHERE t.club_id = public.clubhouse_reservations.club_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('owner', 'coach')
    )
  );

-- UPDATE : réservé aux coachs et membres du comité
CREATE POLICY "Club staff update clubhouse reservations"
  ON public.clubhouse_reservations
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.club_members
      WHERE club_id = public.clubhouse_reservations.club_id
        AND user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.team_members tm
      JOIN public.teams t ON t.id = tm.team_id
      WHERE t.club_id = public.clubhouse_reservations.club_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('owner', 'coach')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.club_members
      WHERE club_id = public.clubhouse_reservations.club_id
        AND user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.team_members tm
      JOIN public.teams t ON t.id = tm.team_id
      WHERE t.club_id = public.clubhouse_reservations.club_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('owner', 'coach')
    )
  );

-- DELETE : réservé aux coachs et membres du comité
CREATE POLICY "Club staff delete clubhouse reservations"
  ON public.clubhouse_reservations
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.club_members
      WHERE club_id = public.clubhouse_reservations.club_id
        AND user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.team_members tm
      JOIN public.teams t ON t.id = tm.team_id
      WHERE t.club_id = public.clubhouse_reservations.club_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('owner', 'coach')
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.clubhouse_reservations TO authenticated;
