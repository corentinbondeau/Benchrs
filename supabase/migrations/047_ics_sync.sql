-- 047_ics_sync.sql
-- Synchronisation Google/Apple Calendar : chaque équipe dispose d'un jeton secret (ics_token)
-- qui autorise la lecture de son calendrier via /api/calendar/ics?team=<id>&token=<token>
-- (abonnement webcal). Le jeton n'est jamais exposé dans les sélects génériques de teams.

ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS ics_token TEXT;

-- Backfill : génère un jeton unique pour les équipes existantes
UPDATE public.teams
SET ics_token = encode(gen_random_bytes(24), 'hex')
WHERE ics_token IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_teams_ics_token ON public.teams(ics_token);
