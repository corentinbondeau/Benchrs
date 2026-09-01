-- 086_championship_standings_team_identity.sql
-- Correctif : la page Championnat n'affiche aucune équipe après import.
--
-- CAUSE
-- Le classement affiché doit être CALCULÉ à partir des matchs (le
-- classement officiel FFF n'est pas accessible, cf. 082/dofa/route.ts,
-- 403 Akamai). `computeStandings` (src/lib/dofa/standings.ts) sait faire
-- ce calcul, mais agrège les équipes par la clé `clNo` + `number`
-- (jamais `short_name` seul : un même club peut engager plusieurs
-- équipes qui partagent le même short_name, distinguées uniquement par
-- leur numéro d'équipe — cas réels observés : PEVELE FC n°6, LEERS OS
-- n°10, TOURCOING US n°4). Or `championship_standings` ne stocke que
-- `home_team`/`away_team` en texte : cette identité est perdue à la
-- persistance, ce qui interdit tout calcul fiable du classement à partir
-- des lignes déjà écrites en base.
--
-- CORRECTIF
-- Ajouter 4 colonnes portant l'identité DOFA de chaque équipe d'un match
-- (club + numéro d'équipe), pour le domicile et l'extérieur.
--
-- ⚠️ Lignes déjà importées avant cette migration : ces 4 colonnes seront
-- NULL sur les matchs existants (aucun UPDATE ici, cf. politique déjà
-- suivie en 082/085 — on ne réécrit jamais l'historique). Le calcul de
-- classement (`computeStandings` appelé depuis GET /api/championships)
-- doit donc IGNORER proprement les lignes dont l'identité est
-- incomplète plutôt que de planter ou de fusionner par nom. Un ré-import
-- de la même poule DOFA (upsert sur championship_id + dofa_ma_no)
-- complètera ces colonnes sur les matchs déjà connus, sans duplication.
--
-- DDL idempotente, rejouable (ADD COLUMN IF NOT EXISTS). Aucun UPDATE sur
-- les lignes existantes, aucune suppression de colonne, aucune donnée
-- perdue. Aucun index (a fortiori aucun index partiel) n'est recréé ici :
-- la migration 085 vient de corriger précisément ce piège (un index
-- partiel est incompatible avec la forme d'ON CONFLICT exprimée par
-- supabase-js) — on ne le réintroduit pas.

ALTER TABLE public.championship_standings
  ADD COLUMN IF NOT EXISTS home_cl_no INTEGER,
  ADD COLUMN IF NOT EXISTS home_team_number INTEGER,
  ADD COLUMN IF NOT EXISTS away_cl_no INTEGER,
  ADD COLUMN IF NOT EXISTS away_team_number INTEGER;
