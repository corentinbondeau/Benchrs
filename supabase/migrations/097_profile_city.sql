ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS city TEXT;

COMMENT ON COLUMN public.profiles.city IS
  'Ville de résidence, utilisée pour faciliter l''organisation du covoiturage';
