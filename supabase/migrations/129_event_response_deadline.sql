-- 129_event_response_deadline.sql
-- Date limite de réponse aux convocations.
--
-- Un évènement peut porter une échéance de réponse (`events.response_deadline`,
-- nullable) : au-delà, les joueurs et les parents ne peuvent plus répondre à la
-- convocation. Côté UI, la personne convoquée n'a plus la main et la ligne
-- d'attendance apparaît dans la section « Pas de réponse » du coach. Côté base,
-- le trigger d'attendances (080/090) refuse toute écriture non-coach après
-- l'échéance — le coach/owner reste toujours libre de saisir une présence
-- (entraînement fait, retard constaté...).
--
-- IMPORTANT : ces triggers s'appliquent aussi au service_role
-- (createAdminClient()), c'est voulu (cf. 080) : `src/lib/convocations.ts`
-- bypass RLS mais ne doit pas contourner la règle métier. La création des
-- lignes d'attendance au moment de l'envoi d'une convocation est un INSERT :
-- elle n'est PAS concernée par la limite (qui ne bloque que les UPDATE/DELETE
-- de réponse).

-- 1) Colonne ----------------------------------------------------------------

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS response_deadline TIMESTAMPTZ;

COMMENT ON COLUMN public.events.response_deadline IS
  'Échéance de réponse à la convocation. NULL = pas de limite. Les joueurs/parents ne peuvent plus répondre (ni modifier leur présence) après cette date.';

-- 2) Trigger d'attendances : exemption coach + limite de réponse -------------
--
-- Ordre de vérification (important) :
--   1. le coach/owner de l'équipe n'est JAMAIS bloqué ;
--   2. un évènement passé (verrou 080/081) bloque tout le monde sauf le coach ;
--   3. après `response_deadline`, seules les écritures de RÉPONSE (UPDATE)
--      des non-coachs sont refusées. Les INSERT restent autorisés (lignes de
--      convocation créées à l'envoi / à la livraison planifiée).

CREATE OR REPLACE FUNCTION public.prevent_locked_attendances_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id          UUID;
  v_event_date        TIMESTAMPTZ;
  v_end_date          TIMESTAMPTZ;
  v_team_id           UUID;
  v_response_deadline TIMESTAMPTZ;
  v_user_role         TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_event_id := OLD.event_id;
  ELSE
    v_event_id := COALESCE(NEW.event_id, OLD.event_id);
  END IF;

  SELECT e.event_date, e.end_date, e.team_id, e.response_deadline
  INTO v_event_date, v_end_date, v_team_id, v_response_deadline
  FROM public.events e
  WHERE e.id = v_event_id;

  -- 1) Coach/owner de l'équipe : jamais bloqué (verrou comme échéance).
  SELECT tm.role INTO v_user_role
  FROM public.team_members tm
  WHERE tm.team_id = v_team_id
    AND tm.user_id = auth.uid()
    AND tm.role IN ('coach', 'owner')
  LIMIT 1;

  IF v_user_role IS NOT NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  -- 2) Évènement passé : plus aucune écriture (sauf coach, ci-dessus).
  IF public.is_event_locked(v_event_date, v_end_date) THEN
    RAISE EXCEPTION 'Modifications interdites : événement terminé'
      USING ERRCODE = 'P0003';
  END IF;

  -- 3) Échéance de réponse dépassée : refus des modifications de réponse.
  --    INSERT (création de la ligne de convocation à l'envoi / à la
  --    livraison planifiée) reste autorisé ; UPDATE et DELETE non.
  IF TG_OP <> 'INSERT'
     AND v_response_deadline IS NOT NULL
     AND v_response_deadline < now() THEN
    RAISE EXCEPTION 'La date limite de réponse est dépassée.'
      USING ERRCODE = 'P0004';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_locked_attendances_write ON public.attendances;
CREATE TRIGGER trg_prevent_locked_attendances_write
  BEFORE INSERT OR UPDATE OR DELETE ON public.attendances
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_locked_attendances_write();
