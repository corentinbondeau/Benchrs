-- 100_match_home_away.sql
-- Différencier un match à domicile (true) d'un match à l'extérieur (false).
-- NULL = statut inconnu (matchs créés avant cette migration, entraînements).
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS is_home BOOLEAN;