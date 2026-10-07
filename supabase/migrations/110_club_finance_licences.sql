-- 110_club_finance_licences.sql
-- Le comité gère l'administratif de TOUT le club, pas de l'équipe sélectionnée.
--
-- Trois permissions à l'échelle du club, du point de vue du comité
-- (`club_members` : comité — le poste de président n'existe plus) :
--   1. cotisations  — définir/encaisser/déduire sur toutes les équipes ;
--   2. licences     — suivi des dossiers FFF de toutes les équipes ;
--   3. trésorerie   — enregistrer une entrée/dépense pour n'importe quelle
--      équipe du club (lecture déjà élargie par la migration 056).
--
-- Contexte : les policies « Members can manage … » de la migration 005
-- passaient par `team_members` : le comité, qui n'est PAS membre d'une équipe,
-- voyait les données (048 a élargi le SELECT) mais ne pouvait RIEN écrire.
-- La page cotisations/trésorerie est pourtant réservée au club.
--
-- Pattern : mêmes vérifications que `public.is_team_coach` (071) — JAMAIS de
-- sous-query sur la table protégée dans une policy RLS, on passe par une
-- fonction SECURITY DEFINER.

-- Helper : l'appelant est-il membre du comité d'un club auquel appartient
-- l'équipe `p_team_id` ?
-- `p_user_id` par défaut = auth.uid() → utilisable tel quel dans les policies
-- RLS ; les routes serveur (service role, où auth.uid() est NULL) le passent
-- explicitement.
CREATE OR REPLACE FUNCTION public.is_club_committee_for_team(p_team_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.club_members cm
    JOIN public.teams t ON t.club_id = cm.club_id
    WHERE cm.user_id = p_user_id
      AND t.id = p_team_id
      AND cm.role = 'comite'
  );
$$;

-- Cotisations : le comité définit/encaisse/déduit pour toutes les équipes.
DROP POLICY IF EXISTS "Members can manage cotisations" ON cotisations;
CREATE POLICY "Members can manage cotisations"
  ON cotisations FOR ALL
  USING (public.is_team_coach(team_id) OR public.is_club_committee_for_team(team_id))
  WITH CHECK (public.is_team_coach(team_id) OR public.is_club_committee_for_team(team_id));

-- Licences : saisie du suivi des dossiers par le coach de l'équipe OU le comité.
DROP POLICY IF EXISTS "Members can manage licences" ON licences;
CREATE POLICY "Members can manage licences"
  ON licences FOR ALL
  USING (public.is_team_coach(team_id) OR public.is_club_committee_for_team(team_id))
  WITH CHECK (public.is_team_coach(team_id) OR public.is_club_committee_for_team(team_id));

-- La table licences n'a JAMAIS reçu de GRANT (seul 000 l'a créée, politiques
-- permissives puis 005) : le client authenticated ne pouvait pas y accéder au
-- niveau privilèges PostgreSQL, quelles que soient les policies RLS.
GRANT SELECT, INSERT, UPDATE, DELETE ON licences TO authenticated;

-- Une seule ligne de licence par joueur et par saison : rend l'upsert
-- `onConflict: "team_id,player_id,season"` possible (la page /admin/licences).
-- La table étant récente et vide, on conserve la première ligne par doublon.
DELETE FROM public.licences a
USING public.licences b
WHERE a.id > b.id
  AND a.team_id = b.team_id
  AND a.player_id = b.player_id
  AND a.season = b.season;
CREATE UNIQUE INDEX IF NOT EXISTS licences_team_player_season_uq
  ON public.licences(team_id, player_id, season);

-- Trésorerie : ajout d'entrée/dépense possible aussi par le comité.
DROP POLICY IF EXISTS "Coaches can manage treasury_transactions" ON treasury_transactions;
CREATE POLICY "Coaches can manage treasury_transactions"
  ON treasury_transactions FOR ALL
  USING (public.is_team_coach(team_id) OR public.is_club_committee_for_team(team_id))
  WITH CHECK (public.is_team_coach(team_id) OR public.is_club_committee_for_team(team_id));