-- 105_locked_events_opponent_editable.sql
-- L'adversaire (opponent) est une donnée du match, pas de la planification :
-- il doit rester modifiable après verrouillage (comme le score/statut).
-- NOTE : is_event_locked existe en surcharge (timestamptz) [080] et
-- (timestamptz, timestamptz DEFAULT NULL) [081] → toujours appeler avec les 2 args.
CREATE OR REPLACE FUNCTION public.prevent_locked_event_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF public.is_event_locked(OLD.event_date, OLD.end_date) THEN
    IF (
      NEW.title IS DISTINCT FROM OLD.title
      OR NEW.description IS DISTINCT FROM OLD.description
      OR NEW.type IS DISTINCT FROM OLD.type
      OR NEW.event_date IS DISTINCT FROM OLD.event_date
      OR NEW.end_date IS DISTINCT FROM OLD.end_date
      OR NEW.meeting_time IS DISTINCT FROM OLD.meeting_time
      OR NEW.location IS DISTINCT FROM OLD.location
      OR NEW.map_url IS DISTINCT FROM OLD.map_url
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