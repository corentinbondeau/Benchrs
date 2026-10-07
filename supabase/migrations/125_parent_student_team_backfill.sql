-- 125_parent_student_team_backfill.sql
-- Les parents reçoivent les convocations via parent_student (route /api/notifications/send
-- expande les destinataires vers les parent_id liés aux joueurs convoqués, filtrés par
-- `parent_student.team_id = <team de l'événement>`).
-- La colonne team_id a été ajoutée en 004 SANS backfill : les liens créés avant cette
-- migration ont team_id NULL → la jointure sur team_id ne les trouve jamais et les parents
-- concernés ne reçoivent pas les convocations.
-- Ce backfill affecte team_id à partir de la ligne team_members (rôle 'player') de l'enfant.

UPDATE parent_student ps
SET team_id = tm.team_id
FROM team_members tm
WHERE ps.team_id IS NULL
  AND tm.user_id = ps.student_id
  AND tm.role = 'player';

-- Rows orphelines (enfant sans team_members 'player' au moment du run) :
-- gardées NULL, seront rattrapées par un prochain run une fois le joueur membre.
-- (une seule équipe par joueur à la fois → pas de risque d'écrasement croisé)