-- 079_universal_onboarding.sql
-- Onboarding universel : présenté à TOUS les utilisateurs après connexion
-- (overlay commun + étapes spécifiques au rôle effectif). Le drapeau
-- `onboarding_completed_at` est NULL tant que l'utilisateur n'a ni terminé
-- ni passé l'onboarding ; il est renseigné aussi bien à la complétion qu'au
-- skip, via la route /api/account/onboarding-complete (admin client,
-- sécurisée getAuthUser), sur le même modèle que
-- 070_parent_onboarding.sql. Aucun backfill : la colonne reste NULL pour
-- tous les profils existants, donc tout le monde repasse l'onboarding
-- (choix produit assumé). Idempotent.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;
