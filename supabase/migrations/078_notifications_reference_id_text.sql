-- Aligne notifications.reference_id sur le schéma du dépôt (TEXT).
--
-- Contexte : 000_full_schema.sql déclare `reference_id TEXT`, mais la base de
-- production porte la colonne en UUID. Toute écriture d'une clé de déduplication
-- composée échoue donc en production avec :
--   invalid input syntax for type uuid: "seance-relance:<uuid>:<uuid>"
--
-- Ces clés composées sont utilisées par : relances de convocation, relances de
-- séance (RPE / analyse), alertes joueurs, rapports trimestriels, relances de
-- cotisation, alertes d'échéance et terrain impraticable.
--
-- Script idempotent : ne fait rien si la colonne est déjà en TEXT.
-- La conversion UUID -> TEXT est sans perte, aucune donnée existante n'est altérée.

DO $$
DECLARE
  v_type TEXT;
BEGIN
  SELECT data_type INTO v_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'notifications'
    AND column_name = 'reference_id';

  IF v_type IS NULL THEN
    RAISE EXCEPTION 'Colonne public.notifications.reference_id introuvable';
  END IF;

  IF v_type = 'uuid' THEN
    ALTER TABLE public.notifications
      ALTER COLUMN reference_id TYPE TEXT USING reference_id::text;
    RAISE NOTICE 'notifications.reference_id converti de uuid vers text';
  ELSE
    RAISE NOTICE 'notifications.reference_id est déjà de type % — aucune action', v_type;
  END IF;
END;
$$;

-- Vérification : doit renvoyer 'text'
SELECT data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'notifications'
  AND column_name = 'reference_id';
