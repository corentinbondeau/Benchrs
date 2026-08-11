-- 068_fix_profiles_update_recursion.sql
-- Cause : la policy manuelle "Coaches can update any profile" sous-requête
-- `profiles` dans sa clause USING -> "infinite recursion detected in policy
-- for relation profiles" -> TOUT UPDATE de profiles échouait (même la
-- modification de ses propres infos personnelles par l'utilisateur).
--
-- Correctif : le check "est-ce un coach ?" passe par une fonction SECURITY
-- DEFINER (les fonctions SECURITY DEFINER contournent la RLS des tables
-- qu'elles lisent, donc plus de récursion).

CREATE OR REPLACE FUNCTION public.is_global_coach()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'coach'
  );
$$;

-- On conserve la sémantique de la policy manuelle (un profil 'coach' peut
-- modifier n'importe quel profil) mais sans sous-query récursif.
DROP POLICY IF EXISTS "Coaches can update any profile" ON public.profiles;
CREATE POLICY "Coaches can update any profile"
  ON public.profiles FOR UPDATE
  USING (public.is_global_coach());

-- Sécurité : la policy manuelle "Users can view all profiles" (USING true,
-- roles public) exposait TOUS les profils à tout le monde, y compris non
-- connectés (PII : téléphone, dates, allergies...). On la retire pour revenir
-- à la visibilité par équipe ("Members can view team profiles") :
--   auth.uid() = id  OR  team_id IS NULL  OR  team_id IN (user_visible_team_ids())
-- Les parents restent couverts car ils ont une ligne team_members (rôle parent)
-- sur la même équipe que leur enfant.
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
