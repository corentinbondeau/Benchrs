-- Migration 094 : s'assurer que departure_time est bien TIMESTAMPTZ
-- Si la colonne est déjà TIMESTAMPTZ (cas probable), cette migration est un no-op.
-- Si elle est encore TIME, la conversion est appliquée.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'carpooling_trips'
      AND column_name = 'departure_time'
      AND data_type = 'time without time zone'
  ) THEN
    ALTER TABLE public.carpooling_trips
      ALTER COLUMN departure_time TYPE TIMESTAMPTZ
      USING (CURRENT_DATE + departure_time)::TIMESTAMPTZ;
  END IF;
END $$;
