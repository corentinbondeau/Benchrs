-- Répare les comptes créés manuellement par script SQL qui ne peuvent pas se connecter
-- (erreur 400 "Invalid login credentials" sur /auth/v1/token?grant_type=password)
--
-- Cause : un INSERT dans auth.users seul est insuffisant. GoTrue résout le login
-- via auth.identities (provider = 'email'). Sans cette ligne, l'utilisateur est
-- introuvable au login. instance_id doit également être renseigné.
--
-- Script idempotent : peut être rejoué sans risque.
-- À exécuter dans le SQL Editor de Supabase (Dashboard > SQL Editor)

DO $$
DECLARE
  v_has_provider_id BOOLEAN;
  v_fixed_instance INTEGER := 0;
  v_fixed_identity INTEGER := 0;
  v_fixed_tokens INTEGER := 0;
  v_rows INTEGER := 0;
  v_col TEXT;
BEGIN
  -- 1) instance_id manquant
  UPDATE auth.users
  SET instance_id = '00000000-0000-0000-0000-000000000000'
  WHERE instance_id IS NULL;
  GET DIAGNOSTICS v_fixed_instance = ROW_COUNT;

  -- 2) identité 'email' manquante
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'auth' AND table_name = 'identities' AND column_name = 'provider_id'
  ) INTO v_has_provider_id;

  IF v_has_provider_id THEN
    INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    SELECT
      gen_random_uuid(),
      u.id,
      u.id::text,
      jsonb_build_object(
        'sub', u.id::text,
        'email', u.email,
        'email_verified', true,
        'phone_verified', false
      ),
      'email',
      NULL,
      now(),
      now()
    FROM auth.users u
    WHERE u.email IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM auth.identities i
        WHERE i.user_id = u.id AND i.provider = 'email'
      );
  ELSE
    INSERT INTO auth.identities (id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    SELECT
      gen_random_uuid(),
      u.id,
      jsonb_build_object(
        'sub', u.id::text,
        'email', u.email,
        'email_verified', true,
        'phone_verified', false
      ),
      'email',
      NULL,
      now(),
      now()
    FROM auth.users u
    WHERE u.email IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM auth.identities i
        WHERE i.user_id = u.id AND i.provider = 'email'
      );
  END IF;
  GET DIAGNOSTICS v_fixed_identity = ROW_COUNT;

  -- 3) Colonnes de token à NULL -> ''
  --    GoTrue (Go) lit ces colonnes comme des string non-nullables.
  --    Un NULL provoque "converting NULL to string is unsupported" => HTTP 500.
  FOREACH v_col IN ARRAY ARRAY[
    'confirmation_token',
    'recovery_token',
    'email_change',
    'email_change_token_new',
    'email_change_token_current',
    'phone_change',
    'phone_change_token',
    'reauthentication_token'
  ]
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = v_col
    ) THEN
      EXECUTE format(
        'UPDATE auth.users SET %I = %L WHERE %I IS NULL',
        v_col, '', v_col
      );
      GET DIAGNOSTICS v_rows = ROW_COUNT;
      v_fixed_tokens := v_fixed_tokens + v_rows;
    END IF;
  END LOOP;

  RAISE NOTICE 'instance_id corrigés : %', v_fixed_instance;
  RAISE NOTICE 'identités email créées : %', v_fixed_identity;
  RAISE NOTICE 'colonnes de token normalisées : %', v_fixed_tokens;
END;
$$;

-- Vérification : cette requête ne doit plus retourner aucune ligne
SELECT
  u.email,
  u.instance_id IS NULL                    AS instance_id_manquant,
  u.email_confirmed_at IS NULL             AS email_non_confirme,
  u.encrypted_password IS NULL             AS password_manquant,
  NOT EXISTS (
    SELECT 1 FROM auth.identities i
    WHERE i.user_id = u.id AND i.provider = 'email'
  )                                        AS identite_manquante,
  (u.confirmation_token IS NULL
    OR u.recovery_token IS NULL
    OR u.email_change IS NULL
    OR u.email_change_token_new IS NULL
    OR u.reauthentication_token IS NULL)   AS tokens_null
FROM auth.users u
WHERE u.instance_id IS NULL
   OR u.email_confirmed_at IS NULL
   OR u.encrypted_password IS NULL
   OR u.confirmation_token IS NULL
   OR u.recovery_token IS NULL
   OR u.email_change IS NULL
   OR u.email_change_token_new IS NULL
   OR u.reauthentication_token IS NULL
   OR NOT EXISTS (SELECT 1 FROM auth.identities i WHERE i.user_id = u.id AND i.provider = 'email');
