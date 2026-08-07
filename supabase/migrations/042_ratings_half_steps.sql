-- ============================================================
-- 042_ratings_half_steps.sql
-- Notes de match (retour coach + notes joueurs/parents) :
-- de 1 à 10 par pas de 0.5 (ex : 7.5).
-- Le rating 0 reste accepté pour un commentaire sans note.
-- ============================================================

-- match_ratings (retour du coach)
ALTER TABLE public.match_ratings DROP CONSTRAINT IF EXISTS match_ratings_rating_check;
ALTER TABLE public.match_ratings ALTER COLUMN rating TYPE NUMERIC(3,1) USING rating::numeric;
ALTER TABLE public.match_ratings ADD CONSTRAINT match_ratings_rating_check
  CHECK (rating = 0 OR (rating >= 1 AND rating <= 10 AND (rating * 2) % 1 = 0));

-- match_player_ratings (notes entre joueurs et parents)
ALTER TABLE public.match_player_ratings DROP CONSTRAINT IF EXISTS match_player_ratings_rating_check;
ALTER TABLE public.match_player_ratings ALTER COLUMN rating TYPE NUMERIC(3,1) USING rating::numeric;
ALTER TABLE public.match_player_ratings ADD CONSTRAINT match_player_ratings_rating_check
  CHECK (rating = 0 OR (rating >= 1 AND rating <= 10 AND (rating * 2) % 1 = 0));
