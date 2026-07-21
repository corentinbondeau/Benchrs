-- Migration 005: Add email_notifications preference to profiles

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS email_notifications BOOLEAN NOT NULL DEFAULT true;

-- Update the cron notification query to respect email_preferences
-- (handled in application code)
