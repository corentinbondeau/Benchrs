-- 085_fix_dofa_upsert_conflict.sql
-- Correctif : l'import DOFA échouait systématiquement à l'écriture des matchs
-- avec l'erreur Postgres 42P10 :
--   "there is no unique or exclusion constraint matching the ON CONFLICT
--    specification"
--
-- CAUSE
-- La migration 082 a créé l'index d'idempotence des matchs en index PARTIEL :
--   CREATE UNIQUE INDEX idx_championship_standings_dofa_ma_no
--     ON championship_standings (championship_id, dofa_ma_no)
--     WHERE dofa_ma_no IS NOT NULL;
--
-- Or PostgreSQL n'accepte un index partiel comme cible d'un ON CONFLICT que si
-- la clause répète exactement le même prédicat
-- (ON CONFLICT (...) WHERE dofa_ma_no IS NOT NULL). Le client supabase-js ne
-- sait exprimer que des noms de colonnes dans son option `onConflict` : il ne
-- peut pas transmettre ce WHERE. L'upsert était donc structurellement
-- impossible, quelles que soient les données envoyées.
--
-- POURQUOI LE PRÉDICAT ÉTAIT INUTILE
-- Il visait à éviter que les championnats/matchs saisis à la main (colonnes
-- DOFA à NULL) n'entrent en collision entre eux. C'était infondé : PostgreSQL
-- considère deux NULL comme DISTINCTS dans un index unique. Un index unique
-- classique n'empêche donc en rien la coexistence de plusieurs lignes à
-- dofa_ma_no NULL, tout en restant utilisable par ON CONFLICT.
--
-- CORRECTIF
-- Remplacer l'index partiel par un index unique classique, sur les mêmes
-- colonnes. La garantie d'unicité sur les matchs importés est identique ;
-- seule la compatibilité avec ON CONFLICT change.
--
-- Le même raisonnement s'applique à idx_championships_dofa_triplet, aligné ici
-- par cohérence : rien ne l'upserte aujourd'hui, mais laisser deux index de
-- même nature avec des comportements différents serait un piège pour la suite.
--
-- DDL idempotente, rejouable. Aucune suppression de colonne, aucun UPDATE sur
-- des lignes existantes, aucune donnée perdue.

-- 1) Matchs importés : clé d'idempotence utilisée par l'upsert -------------

DROP INDEX IF EXISTS public.idx_championship_standings_dofa_ma_no;

CREATE UNIQUE INDEX IF NOT EXISTS idx_championship_standings_dofa_ma_no
  ON public.championship_standings (championship_id, dofa_ma_no);

-- 2) Triplet de poule : aligné par cohérence -------------------------------

DROP INDEX IF EXISTS public.idx_championships_dofa_triplet;

CREATE UNIQUE INDEX IF NOT EXISTS idx_championships_dofa_triplet
  ON public.championships (team_id, dofa_cp_no, dofa_phase, dofa_poule);
