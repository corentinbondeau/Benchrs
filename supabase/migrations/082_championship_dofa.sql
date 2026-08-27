-- 082_championship_dofa.sql
-- Persistance du triplet de poule DOFA (cp_no/phase/poule + identité club)
-- et des matchs importés (championship_standings), avec clé d'idempotence
-- pour permettre un ré-import sans duplication (cf. src/lib/dofa/persist-mapping.ts).
--
-- IMPORTANT — écart avec le plan initial (TODO_import_championnat.md, lot 6) :
-- le plan proposait d'ajouter `championships.team_id`, en pensant que la table
-- n'avait aucun lien vers `teams`. C'est faux : `team_id` existe déjà
-- (004_multi_team.sql), tout comme `championship_standings.team_id`
-- (072_security_fixes.sql) et les policies RLS de lecture/écriture associées
-- (005_rls_team_scoped.sql, 072_security_fixes.sql). On ne les recrée donc
-- PAS ici — seules les colonnes DOFA et les deux index d'idempotence sont
-- ajoutés.
--
-- 1) championships : triplet DOFA (cp_no/phase/poule) + identité club suivie
--    (cl_no/team_number) + horodatage du dernier import.
--
-- 2) championship_standings : métadonnées de match issues du flux DOFA
--    (ma_no, kickoff, lieu, forfait, report) + traçabilité de la source
--    (event_id, source) + clé d'idempotence sur dofa_ma_no.
--
--    ⚠️ home_score/away_score perdent leur DEFAULT 0 et deviennent NULLables :
--    un match à venir n'a pas de score, or DEFAULT 0 le ferait apparaître
--    comme un 0-0 et fausserait le classement. On NE CONVERTIT PAS les
--    lignes existantes en NULL : les 0-0 déjà saisis à la main peuvent être
--    de vrais matchs nuls, rien ne permet de les distinguer après coup après
--    la migration. On change uniquement le comportement des écritures
--    futures, sans réécrire l'historique (pas d'UPDATE ici).
--
-- On ne touche pas à `events` : la traçabilité d'origine d'un import DOFA est
-- portée par `championship_standings.event_id` + `source`, ce qui suffit ;
-- `events` reste la table centrale (agenda, convocations, verrouillage,
-- cf. 080_lock_past_events.sql) et n'a pas besoin d'être modifiée pour ce lot.
--
-- DDL entièrement idempotente (IF NOT EXISTS partout), rejouable sans erreur.
-- Aucune suppression de colonne, aucune perte de données, aucun UPDATE sur
-- des lignes existantes.

-- 1) championships --------------------------------------------------------

ALTER TABLE public.championships
  ADD COLUMN IF NOT EXISTS dofa_cp_no INTEGER,
  ADD COLUMN IF NOT EXISTS dofa_phase INTEGER,
  ADD COLUMN IF NOT EXISTS dofa_poule INTEGER,
  ADD COLUMN IF NOT EXISTS dofa_cl_no INTEGER,
  ADD COLUMN IF NOT EXISTS dofa_team_number INTEGER,
  ADD COLUMN IF NOT EXISTS last_imported_at TIMESTAMPTZ;

-- Clé d'idempotence d'un championnat importé : team_id + triplet DOFA.
-- Index PARTIEL (WHERE dofa_cp_no IS NOT NULL) : PostgreSQL considère deux
-- NULL comme distincts dans un index unique, les championnats saisis à la
-- main n'entreraient donc pas en collision même sans cette clause. La
-- restriction sert à documenter l'intention (cet index n'existe que pour
-- l'idempotence d'import) et à n'indexer que les lignes concernées.
CREATE UNIQUE INDEX IF NOT EXISTS idx_championships_dofa_triplet
  ON public.championships (team_id, dofa_cp_no, dofa_phase, dofa_poule)
  WHERE dofa_cp_no IS NOT NULL;

-- 2) championship_standings -----------------------------------------------

ALTER TABLE public.championship_standings
  ADD COLUMN IF NOT EXISTS dofa_ma_no BIGINT,
  ADD COLUMN IF NOT EXISTS kickoff TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS location TEXT,
  ADD COLUMN IF NOT EXISTS location_address TEXT,
  ADD COLUMN IF NOT EXISTS location_city TEXT,
  ADD COLUMN IF NOT EXISTS postponed BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS home_is_forfeit BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS away_is_forfeit BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES public.events(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';

-- home_score/away_score : retrait du DEFAULT 0, passage en NULLable.
-- Ne modifie que la contrainte de colonne (DROP DEFAULT) : aucune ligne
-- existante n'est touchée, seules les futures écritures qui omettent le
-- score recevront NULL au lieu de 0.
ALTER TABLE public.championship_standings
  ALTER COLUMN home_score DROP DEFAULT,
  ALTER COLUMN away_score DROP DEFAULT;

-- Clé d'idempotence d'un match importé : championship_id + dofa_ma_no.
-- Index PARTIEL (WHERE dofa_ma_no IS NOT NULL) : c'est ce qui permet à
-- l'upsert (cf. buildMatchUpserts) de reconnaître un match déjà importé lors
-- d'un ré-import sans le dupliquer, tout en laissant les matchs saisis à la
-- main (dofa_ma_no NULL) hors de cette contrainte d'unicité.
CREATE UNIQUE INDEX IF NOT EXISTS idx_championship_standings_dofa_ma_no
  ON public.championship_standings (championship_id, dofa_ma_no)
  WHERE dofa_ma_no IS NOT NULL;
