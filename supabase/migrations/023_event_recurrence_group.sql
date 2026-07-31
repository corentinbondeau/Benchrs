-- Groupe de récurrence : relie les occurrences d'un même événement récurrent
ALTER TABLE events ADD COLUMN IF NOT EXISTS recurrence_group_id UUID;
CREATE INDEX IF NOT EXISTS idx_events_recurrence_group ON events(recurrence_group_id);
