-- ============================================================
-- 102 : publication realtime de match_ratings — le "Carnet du
-- joueur" (page /stats/[playerId]) se met à jour dès que le
-- coach enregistre ses retours, sans rechargement manuel.
-- ============================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.match_ratings;
  END IF;
END $$;