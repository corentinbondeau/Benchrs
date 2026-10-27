-- Désactiver les triggers de verrouillage temporairement
ALTER TABLE events DISABLE TRIGGER trg_prevent_locked_event_delete;
ALTER TABLE attendances DISABLE TRIGGER trg_prevent_locked_attendances_write;

DO $$
DECLARE
  tid uuid;
BEGIN
  SELECT id INTO tid FROM teams WHERE name ILIKE '%U100%' LIMIT 1;
  IF tid IS NOT NULL THEN
    -- Supprimer les présences
    DELETE FROM attendances WHERE team_id = tid;
    
    -- Supprimer les événements
    DELETE FROM match_events WHERE team_id = tid;
    DELETE FROM match_stats WHERE team_id = tid;
    DELETE FROM match_ratings WHERE team_id = tid;
    DELETE FROM match_player_ratings WHERE team_id = tid;
    DELETE FROM motm_votes WHERE team_id = tid;
    DELETE FROM formations WHERE team_id = tid;
    DELETE FROM match_lineups WHERE team_id = tid;
    DELETE FROM match_reports WHERE team_id = tid;
    DELETE FROM session_rpe WHERE event_id IN (SELECT id FROM events WHERE team_id = tid);
    DELETE FROM events WHERE team_id = tid;
    
    -- Supprimer les liens parents-enfants pour cette équipe
    DELETE FROM parent_student WHERE team_id = tid;
    
    -- Supprimer les membres parents et joueurs de l'équipe
    DELETE FROM team_members WHERE team_id = tid AND role IN ('parent', 'player');
    
    -- Mettre à null le team_id des profils parents/joueurs qui n'ont plus d'équipe
    UPDATE profiles p
    SET team_id = NULL
    WHERE p.team_id = tid
      AND EXISTS (
        SELECT 1 FROM team_members tm 
        WHERE tm.user_id = p.id AND tm.team_id = tid AND tm.role IN ('parent', 'player')
      )
      AND NOT EXISTS (
        SELECT 1 FROM team_members tm2 
        WHERE tm2.user_id = p.id AND tm2.team_id != tid
      );
  END IF;
END $$;

-- Réactiver les triggers
ALTER TABLE events ENABLE TRIGGER trg_prevent_locked_event_delete;
ALTER TABLE attendances ENABLE TRIGGER trg_prevent_locked_attendances_write;
