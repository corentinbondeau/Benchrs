-- Match en direct : horloge (début/fin) + activation temps réel
ALTER TABLE events ADD COLUMN IF NOT EXISTS match_started_at TIMESTAMPTZ;
ALTER TABLE events ADD COLUMN IF NOT EXISTS match_ended_at TIMESTAMPTZ;

-- Temps réel pour le direct (match_events + statut/score des events)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.match_events;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.events;
  END IF;
END
$$;
