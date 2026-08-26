-- 075_lock_past_events.sql
-- Verrouillage des évènements passés : au-delà de event_date + 3h, la planification
-- de l'évènement (dates, lieu, équipe, ...), les convocations (attendances) et les
-- sondages de disponibilité (match_availability) ne peuvent plus être modifiés.
-- Les champs "live" (score, statut, live, rapports...) restent modifiables.
--
-- IMPORTANT : ces triggers s'appliquent aussi au service_role (createAdminClient()),
-- c'est voulu : src/lib/convocations.ts bypass RLS mais ne doit pas contourner la règle métier.

-- 1) Fonctions utilitaires ----------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_event_locked(p_event_date TIMESTAMPTZ)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT p_event_date IS NOT NULL AND (p_event_date + interval '3 hours' < now());
$$;

CREATE OR REPLACE FUNCTION public.is_event_id_locked(p_event_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_date TIMESTAMPTZ;
BEGIN
  SELECT event_date INTO v_event_date
  FROM public.events
  WHERE id = p_event_id;

  IF v_event_date IS NULL THEN
    RETURN false;
  END IF;

  RETURN public.is_event_locked(v_event_date);
END;
$$;

-- 2) Trigger : blocage de la planification d'un évènement verrouillé ---------

CREATE OR REPLACE FUNCTION public.prevent_locked_event_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF public.is_event_locked(OLD.event_date) THEN
    IF (
      NEW.title IS DISTINCT FROM OLD.title
      OR NEW.description IS DISTINCT FROM OLD.description
      OR NEW.type IS DISTINCT FROM OLD.type
      OR NEW.event_date IS DISTINCT FROM OLD.event_date
      OR NEW.end_date IS DISTINCT FROM OLD.end_date
      OR NEW.meeting_time IS DISTINCT FROM OLD.meeting_time
      OR NEW.location IS DISTINCT FROM OLD.location
      OR NEW.map_url IS DISTINCT FROM OLD.map_url
      OR NEW.opponent IS DISTINCT FROM OLD.opponent
      OR NEW.convocation_lead_days IS DISTINCT FROM OLD.convocation_lead_days
      OR NEW.recurrence_group_id IS DISTINCT FROM OLD.recurrence_group_id
      OR NEW.team_id IS DISTINCT FROM OLD.team_id
      OR NEW.cycle_id IS DISTINCT FROM OLD.cycle_id
      OR NEW.travel_time_min IS DISTINCT FROM OLD.travel_time_min
    ) THEN
      RAISE EXCEPTION 'Cet évènement est passé : sa planification ne peut plus être modifiée.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_locked_event_update ON public.events;
CREATE TRIGGER trg_prevent_locked_event_update
  BEFORE UPDATE ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_locked_event_update();

-- 3) Trigger : blocage de la suppression d'un évènement verrouillé -----------

CREATE OR REPLACE FUNCTION public.prevent_locked_event_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF public.is_event_locked(OLD.event_date) THEN
    RAISE EXCEPTION 'Cet évènement est passé : il ne peut plus être supprimé.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_locked_event_delete ON public.events;
CREATE TRIGGER trg_prevent_locked_event_delete
  BEFORE DELETE ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_locked_event_delete();

-- 4) Trigger : blocage des écritures sur attendances --------------------------

CREATE OR REPLACE FUNCTION public.prevent_locked_attendances_write()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_event_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_event_id := OLD.event_id;
  ELSE
    v_event_id := COALESCE(NEW.event_id, OLD.event_id);
  END IF;

  IF public.is_event_id_locked(v_event_id) THEN
    RAISE EXCEPTION 'Cet évènement est passé : les convocations ne peuvent plus être modifiées.'
      USING ERRCODE = 'P0001';
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

-- 5) Trigger : blocage des écritures sur match_availability -------------------

CREATE OR REPLACE FUNCTION public.prevent_locked_match_availability_write()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_event_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_event_id := OLD.event_id;
  ELSE
    v_event_id := COALESCE(NEW.event_id, OLD.event_id);
  END IF;

  IF public.is_event_id_locked(v_event_id) THEN
    RAISE EXCEPTION 'Cet évènement est passé : le sondage de disponibilité ne peut plus être modifié.'
      USING ERRCODE = 'P0001';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_locked_match_availability_write ON public.match_availability;
CREATE TRIGGER trg_prevent_locked_match_availability_write
  BEFORE INSERT OR UPDATE OR DELETE ON public.match_availability
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_locked_match_availability_write();
