-- 088_championship_journees.sql
-- Stocke la liste officielle des journees de la poule DOFA.
--
-- Contexte : le coach importe la poule de championnat en collant le JSON de
-- la page `poule_journees` du site FFF (second collage, distinct de celui des
-- matchs). Cette liste porte le VRAI calendrier des journees du site
-- (numero + libelle + date officielle) : sans elle, le numéro de journée
-- des matchs importés (`championship_standings.matchday_number`, derivé de
-- `poule_journee.number`) n'a pas de nom officiel à afficher, et les matchs
-- générés automatiquement (round-robin, `source='manual'`) portent des
-- numeros SYNTHETIQUES alignés sur la méthode du cercle, pas sur le
-- calendrier réel du site.
--
-- La liste est stockée telle quelle, sous la forme d'un tableau JSONB de
-- `{ number: int, name: string|null, date: string|null }` (cf.
-- src/lib/dofa/poule-journees.ts, parsePouleJournees). Même structure que
-- `official_standings` (migration 087) : une colonne JSONB sur championships,
-- null tant que le coach n'a pas collé la page.
--
-- DDL idempotente (ADD COLUMN IF NOT EXISTS), rejouable sans erreur. Aucun
-- UPDATE sur les lignes existantes, aucune suppression de colonne.

ALTER TABLE public.championships
  ADD COLUMN IF NOT EXISTS journees JSONB;

COMMENT ON COLUMN public.championships.journees IS
  'Liste officielle des journees de la poule DOFA (endpoint poule_journees). Tableau de {number, name, date} tel que colle par le coach. Null tant que non renseigne.';