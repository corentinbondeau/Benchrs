CREATE OR REPLACE FUNCTION public.upsert_educator_plan(
  p_team_id UUID,
  p_event_id UUID,
  p_exercise_index INTEGER,
  p_user_id UUID,
  p_role TEXT DEFAULT 'responsable'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Supprimer l'assignation existante (s'il y en a une)
  DELETE FROM educator_plans
  WHERE team_id = p_team_id
    AND event_id = p_event_id
    AND exercise_index = p_exercise_index;

  -- Insérer la nouvelle assignation
  INSERT INTO educator_plans (team_id, event_id, exercise_index, user_id, role)
  VALUES (p_team_id, p_event_id, p_exercise_index, p_user_id, p_role);
END;
$$;
