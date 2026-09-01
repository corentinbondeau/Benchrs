-- 083_dofa_event_sync.sql
-- LOT 9 — synchronisation idempotente des matchs importés vers l'agenda
-- (src/lib/dofa/event-sync.ts, planEventSync).
--
-- Ajoute la traçabilité de la DERNIÈRE VALEUR ÉCRITE PAR L'IMPORT sur
-- `championship_standings`, distincte de la valeur ACTUELLE en base sur
-- `events` (`events.event_date` / `events.location`).
--
-- Pourquoi : détecter une saisie manuelle du coach nécessite de comparer la
-- valeur actuelle de l'événement à la dernière valeur que l'import a
-- lui-même écrite. `events.updated_at` est inexploitable (aucun trigger ne
-- le maintient, l'application ne l'écrit jamais) — cf. commentaire en tête
-- de `src/lib/dofa/__tests__/event-sync.test.ts` (correction A4).
--
-- DDL idempotente (IF NOT EXISTS), rejouable sans erreur. Aucune
-- suppression de colonne, aucun UPDATE sur des lignes existantes.

ALTER TABLE public.championship_standings
  ADD COLUMN IF NOT EXISTS last_imported_kickoff TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_imported_location TEXT;
