ALTER TABLE motm_votes ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE motm_votes DROP CONSTRAINT IF EXISTS motm_votes_event_id_fkey;