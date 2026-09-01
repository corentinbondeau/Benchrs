-- 090_unlock_coach_attendances.sql
-- Permettre au coach/owner de modifier les attendances après l'événement.
--
-- La migration 080 a créé trg_prevent_locked_attendances_write qui bloque
-- TOUT le monde une fois l'événement verrouillé. On remplace ici la fonction
-- sous-jacente pour autoriser le coach ou l'owner de l'équipe à agir même
-- après le verrou — sans modifier le trigger (il pointe déjà vers cette
-- fonction via CREATE OR REPLACE, donc l'update est transparent).
--
-- Approche : SECURITY DEFINER + SET search_path = public pour que auth.uid()
-- soit accessible dans le contexte du trigger (identique à is_event_id_locked
-- définie en 080/081).

CREATE OR REPLACE FUNCTION public.prevent_locked_attendances_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_date TIMESTAMPTZ;
  v_end_date   TIMESTAMPTZ;
  v_team_id    UUID;
  v_user_role  TEXT;
BEGIN
  -- Récupérer la date de l'événement et le team_id depuis events
  SELECT e.event_date, e.end_date, e.team_id
  INTO v_event_date, v_end_date, v_team_id
  FROM public.events e
  WHERE e.id = COALESCE(NEW.event_id, OLD.event_id);

  -- Si l'événement n'est pas verrouillé, autoriser immédiatement
  IF NOT public.is_event_locked(v_event_date, v_end_date) THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  -- Vérifier si l'utilisateur courant est coach ou owner de l'équipe
  SELECT tm.role INTO v_user_role
  FROM public.team_members tm
  WHERE tm.team_id = v_team_id
    AND tm.user_id = auth.uid()
    AND tm.role IN ('coach', 'owner')
  LIMIT 1;

  -- Si coach/owner, autoriser même après verrouillage
  IF v_user_role IS NOT NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  -- Sinon : bloquer (joueur ou rôle non reconnu)
  RAISE EXCEPTION 'Modifications interdites : événement terminé'
    USING ERRCODE = 'P0003';
END;
$$;
