-- 049_club_fff_identity.sql
-- Identité canonique des clubs : numéro d'affiliation FFF (unique, 6 chiffres).
-- Le nom devient un simple libellé d'affichage ; la déduplication se fait par numéro FFF
-- (un même club réel = un seul row clubs, quelle que soit l'orthographe du nom : ECC, ecc,
-- Etoile Club de Camphin, ...). Les variantes de nom sont gérées par club_aliases.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Numéro d'affiliation FFF (nullable : les clubs existants n'en ont pas encore)
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS fff_number TEXT;
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS name_normalized TEXT;

-- Unicité canonique (index partiel : NULL autorisé, jamais de doublon entre 2 clubs)
DROP INDEX IF EXISTS clubs_fff_number_key;
CREATE UNIQUE INDEX clubs_fff_number_key ON public.clubs (fff_number) WHERE fff_number IS NOT NULL;

-- Contrainte de format : 6 chiffres exactement (ou NULL)
DO $$ BEGIN
  ALTER TABLE public.clubs DROP CONSTRAINT IF EXISTS clubs_fff_number_check;
  ALTER TABLE public.clubs ADD CONSTRAINT clubs_fff_number_check
    CHECK (fff_number IS NULL OR fff_number ~ '^[0-9]{6}$');
END $$;

-- Index pour la recherche de nom (fallback / autocomplétion)
CREATE INDEX IF NOT EXISTS clubs_name_normalized_idx ON public.clubs (name_normalized);
CREATE INDEX IF NOT EXISTS clubs_name_trgm_idx ON public.clubs USING gin (name gin_trgm_ops);

-- Variantes de nom du club (acronymes, noms d'usage) : "ECC" -> Etoile Club de Camphin
CREATE TABLE IF NOT EXISTS public.club_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (club_id, alias)
);

CREATE INDEX IF NOT EXISTS idx_club_aliases_club ON public.club_aliases(club_id);

ALTER TABLE public.club_aliases ENABLE ROW LEVEL SECURITY;

-- Membres du club (team_members + comité) : lecture
DROP POLICY IF EXISTS "Members can view club_aliases" ON public.club_aliases;
CREATE POLICY "Members can view club_aliases"
  ON public.club_aliases FOR SELECT
  USING (club_id IN (SELECT public.user_club_ids()));

-- Président (ou créateur) : gestion des alias
DROP POLICY IF EXISTS "Presidents can manage club_aliases" ON public.club_aliases;
CREATE POLICY "Presidents can manage club_aliases"
  ON public.club_aliases FOR ALL
  USING (public.is_club_president(club_id))
  WITH CHECK (public.is_club_president(club_id));
