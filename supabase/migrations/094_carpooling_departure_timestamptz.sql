-- Migration 094 : changer departure_time de TIME en TIMESTAMPTZ
-- Le champ TIME ne stocke pas la date, ce qui est problématique pour le covoiturage
-- (on veut savoir le jour ET l'heure de départ).
-- Le code client envoie maintenant un ISO timestamp complet.

ALTER TABLE public.carpooling_trips
  ALTER COLUMN departure_time TYPE TIMESTAMPTZ
  USING CASE
    WHEN departure_time IS NOT NULL THEN
      (CURRENT_DATE + departure_time)::TIMESTAMPTZ
    ELSE NULL
  END;
