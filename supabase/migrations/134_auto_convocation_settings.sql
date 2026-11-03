-- Add auto-convocation settings to events table
-- These settings apply to the entire recurrence group

ALTER TABLE events 
ADD COLUMN IF NOT EXISTS auto_convocation_delay_days INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS auto_convocation_player_ids UUID[] DEFAULT '{}';

-- Index for efficiency when filtering events by recurrence
CREATE INDEX IF NOT EXISTS idx_events_auto_convocation 
ON events(recurrence_group_id) 
WHERE auto_convocation_delay_days > 0;

-- Comment for clarity
COMMENT ON COLUMN events.auto_convocation_delay_days IS 
'Number of days before event date to send auto-convocations (applies to entire recurrence group)';

COMMENT ON COLUMN events.auto_convocation_player_ids IS 
'Whitelist of player UUIDs eligible for auto-convocation (applies to entire recurrence group)';
