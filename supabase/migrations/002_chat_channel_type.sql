-- Add channel_type to chat_channels for role-based access
ALTER TABLE chat_channels ADD COLUMN IF NOT EXISTS channel_type TEXT NOT NULL DEFAULT 'general';

-- Set existing General channel type
UPDATE chat_channels SET channel_type = 'general' WHERE name = 'General';

-- Seed new channels
INSERT INTO chat_channels (name, description, channel_type) VALUES
  ('Parents', 'Canal réservé aux parents', 'parents'),
  ('Coachs', 'Canal réservé aux coachs', 'coaches')
ON CONFLICT DO NOTHING;
