-- ============================================================
-- 107_video_security.sql
-- Remédiation de l'audit sécurité (rapport F2/F3/F4/F6/F7) :
--   1) RLS video_analyses resserrée :
--        INSERT  : membre de l'équipe (user_team_ids, pas le comité)
--                  ET storage_path dans SON dossier (pas de référence
--                  vers un objet d'un autre membre)
--        UPDATE  : coach OR (créateur, son job 'pending' → 'canceled')
--                  → plus aucun membre ne peut toucher progress/result
--        DELETE  : créateur OU coach (aligné sur l'API)
--   2) RPC claim_next_video_job : réclamation ATOMIQUE (une seule ligne)
--      avec re-claim heartbeat des jobs 'processing' orphelins
--      (started_at < now() - timeout).
--   3) Rôle PostgreSQL à moindre privilège 'cruncher' (worker) :
--      ne peut QUE lire/mettre à jour video_analyses. Le worker peut
--      utiliser cette identité au lieu de la service_role (optionnel,
--      alternatif : rester sur service_role mais le secret doit être
--      isolé + roté).
-- ============================================================

-- ════════════════════════════════════════════════════════════
-- 1. RLS video_analyses
-- ════════════════════════════════════════════════════════════

-- INSERT : membre effectif de l'équipe + chemin d'upload personnel.
DROP POLICY IF EXISTS "Members can insert video analyses" ON public.video_analyses;
CREATE POLICY "Members can insert video analyses"
  ON public.video_analyses FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND team_id IN (SELECT public.user_team_ids())
    AND storage_path LIKE 'match_videos/' || team_id::text || '/' || auth.uid()::text || '/%'
  );

-- UPDATE : un membre ne peut qu'annuler son propre job 'pending' ;
-- les coachs/owners gèrent tout le reste (le worker passe par sa
-- propre identité service_role/cruncher, non soumise à la RLS).
DROP POLICY IF EXISTS "Creator or coach can update video analysis" ON public.video_analyses;
CREATE POLICY "Members can cancel own pending analysis"
  ON public.video_analyses FOR UPDATE
  USING (created_by = auth.uid() AND status = 'pending')
  WITH CHECK (created_by = auth.uid() AND status = 'canceled');

CREATE POLICY "Coaches can manage video analysis"
  ON public.video_analyses FOR UPDATE
  USING (public.is_team_coach(team_id))
  WITH CHECK (public.is_team_coach(team_id));

-- DELETE : créateur OU coach/owner (aligné sur l'API DELETE).
DROP POLICY IF EXISTS "Creator or coach can delete video analysis" ON public.video_analyses;
CREATE POLICY "Creator or coach can delete video analysis"
  ON public.video_analyses FOR DELETE
  USING (created_by = auth.uid() OR public.is_team_coach(team_id));

-- ════════════════════════════════════════════════════════════
-- 2. Réclamation atomique + re-claim heartbeat
--    Initialise progress=1 (jamais 0 : le front sait que ça démarre)
--    et `SELECT ... FOR UPDATE SKIP LOCKED` évite le double traitement.
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.claim_next_video_job(p_timeout_min integer DEFAULT 15)
RETURNS SETOF public.video_analyses
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id
  FROM public.video_analyses
  WHERE status = 'pending'
     OR (status = 'processing' AND started_at < now() - make_interval(mins => p_timeout_min))
  ORDER BY created_at
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  UPDATE public.video_analyses
  SET status = 'processing',
      progress = GREATEST(progress, 1),
      started_at = now()
  WHERE id = v_id
  RETURNING *;
END;
$$;

-- Heartbeat : prolonge l'horodatage de démarrage d'un job en cours
-- (appelé par le worker pendant le traitement long).
CREATE OR REPLACE FUNCTION public.touch_video_job(p_job_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.video_analyses
  SET started_at = now()
  WHERE id = p_job_id AND status = 'processing';
END;
$$;

-- Exécution restreinte : seuls service_role / cruncher appellent le RPC.
REVOKE EXECUTE ON FUNCTION public.claim_next_video_job(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.touch_video_job(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_next_video_job(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.touch_video_job(uuid) TO service_role;

-- ════════════════════════════════════════════════════════════
-- 3. Rôle worker à moindre privilège ('cruncher')
--    Usage optionnel : le worker peut utiliser cette identité au lieu
--    de la service_role. La migration crée le rôle SANS mot de passe
--    (NOLOGIN) ; l'exploitant active le LOGIN avec un mot de passe fort
--    MANUELLEMENT quand il branche le worker (jamais de mot de passe
--    par défaut committé) :
--      ALTER ROLE cruncher LOGIN PASSWORD '<mot de passe fort>';
--    À défaut : garder service_role mais ISOLER + ROTER le secret (F3).
-- ════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cruncher') THEN
    CREATE ROLE cruncher;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO cruncher;
GRANT SELECT ON public.video_analyses TO cruncher;
GRANT UPDATE (status, progress, result, error, model_version, started_at, completed_at)
  ON public.video_analyses TO cruncher;
GRANT EXECUTE ON FUNCTION public.claim_next_video_job(integer) TO cruncher;
GRANT EXECUTE ON FUNCTION public.touch_video_job(uuid) TO cruncher;

-- BYPASSRLS : rôle applicatif de la file d'attente qui écrit via ses
-- grants directs (les policies RLS ciblent les utilisateurs). Aucun
-- autre privilège sur les autres tables → surface minimale.
ALTER ROLE cruncher BYPASSRLS;