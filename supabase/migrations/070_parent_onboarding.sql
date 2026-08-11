-- 070_parent_onboarding.sql
-- Drapeau d'onboarding des parents : le wizard de découverte des
-- fonctionnalités n'est affiché qu'une seule fois (1re connexion d'un compte
-- parent). Mise à jour via la route /api/account/onboarding-done (admin
-- client, sécurisée getAuthUser) pour éviter toute dépendance à la RLS
-- profiles. Idempotent.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS parent_onboarding_done BOOLEAN NOT NULL DEFAULT false;
