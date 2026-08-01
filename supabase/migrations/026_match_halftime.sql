-- Phases du match en direct : mi-temps et reprise de la 2e période
ALTER TABLE events ADD COLUMN IF NOT EXISTS match_halftime_at TIMESTAMPTZ;
ALTER TABLE events ADD COLUMN IF NOT EXISTS match_resumed_at TIMESTAMPTZ;

-- Temps réel pour la synchronisation des stats
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.match_stats;
  END IF;
END
$$;
