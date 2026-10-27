-- Désactiver les triggers de verrouillage temporairement
ALTER TABLE events DISABLE TRIGGER trg_prevent_locked_event_delete;
ALTER TABLE attendances DISABLE TRIGGER trg_prevent_locked_attendances_write;

DO $$
DECLARE
  tid uuid;
BEGIN
  SELECT id INTO tid FROM teams WHERE name ILIKE '%U100%' LIMIT 1;
  IF tid IS NOT NULL THEN
    DELETE FROM attendances WHERE team_id = tid;
    DELETE FROM match_events WHERE team_id = tid;
    DELETE FROM match_stats WHERE team_id = tid;
    DELETE FROM match_ratings WHERE team_id = tid;
    DELETE FROM match_player_ratings WHERE team_id = tid;
    DELETE FROM motm_votes WHERE team_id = tid;
    DELETE FROM formations WHERE team_id = tid;
    DELETE FROM match_lineups WHERE team_id = tid;
    DELETE FROM match_reports WHERE team_id = tid;
    DELETE FROM notifications WHERE team_id = tid;
    DELETE FROM tasks WHERE team_id = tid;
    DELETE FROM trophies WHERE team_id = tid;
    DELETE FROM gallery_media WHERE team_id = tid;
    DELETE FROM injuries WHERE team_id = tid;
    DELETE FROM training_sessions WHERE team_id = tid;
    DELETE FROM season_cycles WHERE team_id = tid;
    DELETE FROM team_settings WHERE team_id = tid;
    DELETE FROM session_rpe WHERE event_id IN (SELECT id FROM events WHERE team_id = tid);
    DELETE FROM player_availability WHERE team_id = tid;
    DELETE FROM events WHERE team_id = tid;
    DELETE FROM team_members WHERE team_id = tid;
    DELETE FROM cotisations WHERE team_id = tid;
    DELETE FROM licences WHERE team_id = tid;
    DELETE FROM parent_student WHERE team_id = tid;
    UPDATE profiles SET team_id = NULL WHERE team_id = tid;
    DELETE FROM teams WHERE id = tid;
  END IF;
END $$;

-- Réactiver les triggers
ALTER TABLE events ENABLE TRIGGER trg_prevent_locked_event_delete;
ALTER TABLE attendances ENABLE TRIGGER trg_prevent_locked_attendances_write;
