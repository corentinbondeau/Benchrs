-- ============================================================
-- 050_cycle_type_phases.sql
-- Aligne les types de cycle de saison sur les phases de la
-- création de séances (mêmes intitulés).
-- Migration 040 (à appliquer en premier) crée déjà la table avec
-- les nouveaux intitulés ; celle-ci migre les bases où 040 avait
-- été appliquée avec les anciennes valeurs (preparation/competition/athletisation).
-- ============================================================

ALTER TABLE public.season_cycles DROP CONSTRAINT IF EXISTS season_cycles_cycle_type_check;

-- Rebasculer les anciennes valeurs vers les phases correspondantes
-- (best-effort ; en pratique la table est vide ou récente).
UPDATE public.season_cycles
SET cycle_type = CASE
  WHEN cycle_type = 'preparation' THEN 'CONSERVER / PROGRESSER'
  WHEN cycle_type = 'competition' THEN 'DÉSEQUILIBRER / FINIR'
  WHEN cycle_type = 'athletisation' THEN 'ATHLETISATION'
  ELSE cycle_type
END;

ALTER TABLE public.season_cycles
  ADD CONSTRAINT season_cycles_cycle_type_check CHECK (cycle_type IN (
    'DÉSEQUILIBRER / FINIR',
    'CONSERVER / PROGRESSER',
    'S''OPPOSER À LA PROGRESSION',
    'S''ORGANISER POUR RECUPERER',
    'ATHLETISATION'
  ));
