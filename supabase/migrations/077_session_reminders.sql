-- Relance combinée RPE / analyse de séance : opt-out par équipe.
-- Calqué sur attendance_reminders_enabled (063_enrichment_feed_notebook.sql).
ALTER TABLE public.team_settings ADD COLUMN IF NOT EXISTS rpe_reminders_enabled BOOLEAN NOT NULL DEFAULT true;
