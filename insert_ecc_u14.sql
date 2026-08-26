-- Insère les 14 joueurs de l'équipe U14 (club ECC)
-- À exécuter dans le SQL Editor de Supabase (Dashboard > SQL Editor)
--
-- Script idempotent : rejouable sans créer de doublon.
-- NOTE : la ligne auth.identities est OBLIGATOIRE, sinon GoTrue renvoie
--        400 "Invalid login credentials" au login.

DO $$
DECLARE
  v_club_id UUID;
  v_team_id UUID;
  v_player_id UUID;
  v_email TEXT;
  v_created INTEGER := 0;
  r RECORD;
BEGIN
  -- Club ECC
  SELECT id INTO v_club_id FROM clubs WHERE name = 'ECC';
  IF v_club_id IS NULL THEN
    INSERT INTO clubs (name) VALUES ('ECC') RETURNING id INTO v_club_id;
  END IF;

  -- Équipe U14
  SELECT id INTO v_team_id FROM teams WHERE name = 'U14' AND club_id = v_club_id;
  IF v_team_id IS NULL THEN
    INSERT INTO teams (club_id, name, invite_code)
    VALUES (v_club_id, 'U14', 'cf231b36ea9d')
    RETURNING id INTO v_team_id;
  END IF;

  FOR r IN
    SELECT * FROM (VALUES
      ('Lucas',   'Dupont',   'lucas.dupont@email.fr',    'Gardien',            1),
      ('Hugo',    'Martin',   'hugo.martin@email.fr',     'Défenseur Central',  2),
      ('Ethan',   'Petit',    'ethan.petit@email.fr',     'Défenseur Central',  3),
      ('Nathan',  'Bernard',  'nathan.bernard@email.fr',  'Arrière Droit',      4),
      ('Tom',     'Richard',  'tom.richard@email.fr',     'Arrière Gauche',     5),
      ('Jules',   'Moreau',   'jules.moreau@email.fr',    'Milieu Défenseur',   6),
      ('Enzo',    'Dubois',   'enzo.dubois@email.fr',     'Milieu Central',     7),
      ('Mathis',  'Laurent',  'mathis.laurent@email.fr',  'Milieu Offensif',    8),
      ('Maxime',  'Lefebvre', 'maxime.lefebvre@email.fr', 'Ailier Droit',       9),
      ('Théo',    'Girard',   'theo.girard@email.fr',     'Ailier Gauche',     10),
      ('Noam',    'Roux',     'noam.roux@email.fr',       'Buteur',            11),
      ('Louis',   'Simon',    'louis.simon@email.fr',     'Buteur',            12),
      ('Adam',    'Michel',   'adam.michel@email.fr',     'Défenseur Central', 13),
      ('Gabriel', 'Leroy',    'gabriel.leroy@email.fr',   'Milieu Central',    14)
    ) AS t(first_name, last_name, email, position, shirt_number)
  LOOP
    v_email := r.email;

    -- Idempotence : on saute les comptes déjà présents
    IF EXISTS (SELECT 1 FROM auth.users WHERE email = v_email) THEN
      CONTINUE;
    END IF;

    v_player_id := gen_random_uuid();

    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, aud, role,
      created_at, updated_at, confirmation_sent_at, is_sso_user
    )
    VALUES (
      v_player_id,
      '00000000-0000-0000-0000-000000000000',
      v_email,
      crypt('Sportplus2024!', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}',
      jsonb_build_object('first_name', r.first_name, 'last_name', r.last_name),
      'authenticated', 'authenticated',
      now(), now(), now(), false
    );

    -- OBLIGATOIRE : sans cette identité, le login renvoie 400
    INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at)
    VALUES (
      gen_random_uuid(),
      v_player_id,
      v_player_id::text,
      jsonb_build_object('sub', v_player_id::text, 'email', v_email, 'email_verified', true, 'phone_verified', false),
      'email',
      now(), now()
    );

    INSERT INTO profiles (id, role, first_name, last_name, position, shirt_number, is_active, team_id)
    VALUES (v_player_id, 'player', r.first_name, r.last_name, r.position, r.shirt_number, true, v_team_id);

    INSERT INTO team_members (team_id, user_id, role)
    VALUES (v_team_id, v_player_id, 'player');

    v_created := v_created + 1;
  END LOOP;

  RAISE NOTICE '% joueur(s) inséré(s) pour U14 (les comptes déjà existants ont été ignorés)', v_created;
  RAISE NOTICE 'Mot de passe pour tous : Sportplus2024!';
END;
$$;
