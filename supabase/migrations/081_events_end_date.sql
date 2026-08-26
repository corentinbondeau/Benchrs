-- 081_events_end_date.sql
-- Exploitation de la colonne events.end_date (déjà présente en base, jamais
-- écrite ni affichée jusqu'ici) : c'est désormais la référence de fin réelle
-- d'un évènement, saisie par l'utilisateur (optionnelle).
--
-- 1) Contrainte de cohérence : si end_date est renseignée, elle doit être
--    strictement postérieure à event_date. Tolère NULL (tout l'historique
--    l'est, et la saisie reste optionnelle). Idempotent : on ne recrée la
--    contrainte que si elle n'existe pas déjà.
--
-- 2) Alignement du verrou SQL sur la sémantique déjà livrée côté TypeScript
--    (src/lib/event-lock.ts, isEventLocked) : quand end_date est connue, elle
--    fait foi ; sinon on retombe sur la règle historique event_date + 3h.
--    is_event_locked() et is_event_id_locked() sont mises à jour en
--    conséquence, ainsi que le trigger qui les appelle.
--
-- Pas de backfill : les évènements passés restent avec end_date IS NULL et
-- continuent de suivre la règle des 3h (le trigger de 080 protège de toute
-- façon end_date sur un évènement déjà verrouillé).

-- 1) Contrainte de cohérence -------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'events_end_date_after_event_date'
      AND conrelid = 'public.events'::regclass
  ) THEN
    ALTER TABLE public.events
      ADD CONSTRAINT events_end_date_after_event_date
      CHECK (end_date IS NULL OR end_date > event_date);
  END IF;
END;
$$;

-- 2) Alignement du verrou SQL -------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_event_locked(
  p_event_date TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT p_event_date IS NOT NULL
    AND (COALESCE(p_end_date, p_event_date + interval '3 hours') < now());
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
  v_end_date TIMESTAMPTZ;
BEGIN
  SELECT event_date, end_date INTO v_event_date, v_end_date
  FROM public.events
  WHERE id = p_event_id;

  IF v_event_date IS NULL THEN
    RETURN false;
  END IF;

  RETURN public.is_event_locked(v_event_date, v_end_date);
END;
$$;

-- Le trigger de blocage de la planification doit désormais tenir compte de
-- OLD.end_date pour déterminer si l'évènement est verrouillé.
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

-- Idem pour la suppression.
CREATE OR REPLACE FUNCTION public.prevent_locked_event_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF public.is_event_locked(OLD.event_date, OLD.end_date) THEN
    RAISE EXCEPTION 'Cet évènement est passé : il ne peut plus être supprimé.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN OLD;
END;
$$;
