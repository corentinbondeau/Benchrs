-- Date à laquelle les convocations de l'événement ont réellement été envoyées (livrées)
ALTER TABLE events ADD COLUMN IF NOT EXISTS convocations_sent_at TIMESTAMPTZ;
