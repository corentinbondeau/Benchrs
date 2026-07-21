-- Add meeting_time column to events
ALTER TABLE events ADD COLUMN IF NOT EXISTS meeting_time TIME;
