-- 109_purge_generated_fixtures.sql
-- Purge des matchs de poule FABRIQUÉS, jamais importés de la FFF.
--
-- Contexte : jusqu'à cette version, la route `/api/championships/dofa/ingest`
-- complétait implicitement la poule à CHAQUE import via `missingPoolFixtures`
-- (round-robin aller-retour sur toutes les équipes de la poule), « pour que la
-- liste des résultats reflète la poule complète ». Ces lignes sont
-- conventionnellement `source = 'manual'` et n'ont PAS de `dofa_ma_no` :
-- le numéro de match FFF est précisément ce qui distingue un vrai match
-- importé d'une confrontation générée (cf. index partiel
-- `championship_standings(championship_id, dofa_ma_no) WHERE dofa_ma_no IS NOT
-- NULL`).
--
-- Elles polluent la lecture du coach : des journées fictives aux scores vides,
-- sans date, sans résultat, dans une poule dont il ne reste que les quelques
-- matchs réellement importés.
--
-- Périmètre : cette purge supprime TOUTE ligne `source = 'manual'` sans
-- `dofa_ma_no`, ce qui inclut aussi un match que le coach aurait saisi à la
-- main depuis la table des résultats (la route POST
-- `/api/championships/standings` insère dans la même forme). Aucune colonne ne
-- permet de distinguer les deux cas : c'est un choix assumé — une poule
-- honnête (vide plutôt que fausse) vaut mieux que la conservation d'une saisie
-- manuelle.
--
-- Sûr par construction :
--   - une ligne importée de la FFF porte `source = 'dofa_import'` ET un
--     `dofa_ma_no` : elle ne matche jamais le prédicat ;
--   - une ligne rattachée au calendrier porte un `event_id` : ces lignes sont
--     exclues explicitement pour ne pas laisser un événement de match orphelin
--     dans `events` ;
--   - le périmètre équipe est explicite (ECC U18) et un `RAISE NOTICE` liste
--     les ligues et les matchs touchés AVANT toute suppression.
--
-- Depuis, l'import n'invent PLUS rien : la génération est devenue explicite
-- (bouton « Générer la poule » → POST /api/championships/generate), donc un
-- ré-import ne recrée pas ces lignes. Cette migration est donc un nettoyage
-- ponctuel de l'historique, pas le début d'une boucle sans fin.
--
-- Idempotent : une seconde exécution ne trouve plus rien à supprimer.

DO $$
DECLARE
  v_team_label TEXT;
  v_rows TEXT[];
  v_deleted INTEGER;
BEGIN
  -- Cibler les championnats de l'équipe ECC U18.
  SELECT t.name INTO v_team_label
  FROM public.championships c
  JOIN public.teams t ON t.id = c.team_id
  WHERE t.name ILIKE '%ECC%'
    AND t.name ILIKE '%U18%'
  LIMIT 1;

  IF v_team_label IS NULL THEN
    RAISE NOTICE 'Purge annulée : aucune équipe ne correspond à ECC + U18.';
    RETURN;
  END IF;

  RAISE NOTICE 'Équipe ciblée : %', v_team_label;

  -- Liste lisible de ce qui va disparaître (contrôle avant suppression).
  SELECT COALESCE(array_agg(
    format('J%s %s - %s', COALESCE(s.matchday_number::text, '?'), s.home_team, s.away_team)
    ORDER BY s.matchday_number, s.home_team
  ), '{}') INTO v_rows
  FROM public.championship_standings s
  JOIN public.championships c ON c.id = s.championship_id
  JOIN public.teams t ON t.id = c.team_id
  WHERE t.name ILIKE '%ECC%'
    AND t.name ILIKE '%U18%'
    AND s.source = 'manual'
    AND s.dofa_ma_no IS NULL
    AND s.event_id IS NULL;

  IF array_length(v_rows, 1) IS NULL THEN
    RAISE NOTICE 'Aucun match généré à supprimer (poule déjà propre).';
    RETURN;
  END IF;

  RAISE NOTICE 'Suppression de % ligne(s) générée(s) : %', array_length(v_rows, 1), v_rows;

  WITH deleted AS (
    DELETE FROM public.championship_standings s
    USING public.championships c, public.teams t
    WHERE s.championship_id = c.id
      AND c.team_id = t.id
      AND t.name ILIKE '%ECC%'
      AND t.name ILIKE '%U18%'
      AND s.source = 'manual'
      AND s.dofa_ma_no IS NULL
      AND s.event_id IS NULL
    RETURNING 1
  )
  SELECT count(*) INTO v_deleted FROM deleted;

  RAISE NOTICE 'Purge terminée : % ligne(s) supprimée(s).', v_deleted;
END $$;