-- Insérer 14 joueurs pour l'équipe U14
-- À exécuter dans le SQL Editor de Supabase (Dashboard > SQL Editor)

DO $$
DECLARE
  v_club_id UUID;
  v_team_id UUID;
  v_player_id UUID;
BEGIN
  -- Créer le club ECC s'il n'existe pas
  SELECT id INTO v_club_id FROM clubs WHERE name = 'ECC';
  IF v_club_id IS NULL THEN
    INSERT INTO clubs (name) VALUES ('ECC') RETURNING id INTO v_club_id;
  END IF;

  -- Créer l'équipe U14
  SELECT id INTO v_team_id FROM teams WHERE name = 'U14' AND club_id = v_club_id;
  IF v_team_id IS NULL THEN
    INSERT INTO teams (club_id, name, invite_code) VALUES (v_club_id, 'U14', 'cf231b36ea9d') RETURNING id INTO v_team_id;
  END IF;

  -- Lucas Dupont
  v_player_id := gen_random_uuid();
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at, confirmation_sent_at, is_sso_user)
  VALUES (v_player_id, 'lucas.dupont@email.fr', crypt('Sportplus2024!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', jsonb_build_object('first_name', 'Lucas', 'last_name', 'Dupont'), 'authenticated', 'authenticated', now(), now(), now(), false);
  INSERT INTO profiles (id, role, first_name, last_name, position, shirt_number, is_active, team_id)
  VALUES (v_player_id, 'player', 'Lucas', 'Dupont', 'Gardien', 1, true, v_team_id);
  INSERT INTO team_members (team_id, user_id, role) VALUES (v_team_id, v_player_id, 'player');

  -- Hugo Martin
  v_player_id := gen_random_uuid();
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at, confirmation_sent_at, is_sso_user)
  VALUES (v_player_id, 'hugo.martin@email.fr', crypt('Sportplus2024!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', jsonb_build_object('first_name', 'Hugo', 'last_name', 'Martin'), 'authenticated', 'authenticated', now(), now(), now(), false);
  INSERT INTO profiles (id, role, first_name, last_name, position, shirt_number, is_active, team_id)
  VALUES (v_player_id, 'player', 'Hugo', 'Martin', 'Défenseur Central', 2, true, v_team_id);
  INSERT INTO team_members (team_id, user_id, role) VALUES (v_team_id, v_player_id, 'player');

  -- Ethan Petit
  v_player_id := gen_random_uuid();
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at, confirmation_sent_at, is_sso_user)
  VALUES (v_player_id, 'ethan.petit@email.fr', crypt('Sportplus2024!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', jsonb_build_object('first_name', 'Ethan', 'last_name', 'Petit'), 'authenticated', 'authenticated', now(), now(), now(), false);
  INSERT INTO profiles (id, role, first_name, last_name, position, shirt_number, is_active, team_id)
  VALUES (v_player_id, 'player', 'Ethan', 'Petit', 'Défenseur Central', 3, true, v_team_id);
  INSERT INTO team_members (team_id, user_id, role) VALUES (v_team_id, v_player_id, 'player');

  -- Nathan Bernard
  v_player_id := gen_random_uuid();
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at, confirmation_sent_at, is_sso_user)
  VALUES (v_player_id, 'nathan.bernard@email.fr', crypt('Sportplus2024!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', jsonb_build_object('first_name', 'Nathan', 'last_name', 'Bernard'), 'authenticated', 'authenticated', now(), now(), now(), false);
  INSERT INTO profiles (id, role, first_name, last_name, position, shirt_number, is_active, team_id)
  VALUES (v_player_id, 'player', 'Nathan', 'Bernard', 'Arrière Droit', 4, true, v_team_id);
  INSERT INTO team_members (team_id, user_id, role) VALUES (v_team_id, v_player_id, 'player');

  -- Tom Richard
  v_player_id := gen_random_uuid();
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at, confirmation_sent_at, is_sso_user)
  VALUES (v_player_id, 'tom.richard@email.fr', crypt('Sportplus2024!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', jsonb_build_object('first_name', 'Tom', 'last_name', 'Richard'), 'authenticated', 'authenticated', now(), now(), now(), false);
  INSERT INTO profiles (id, role, first_name, last_name, position, shirt_number, is_active, team_id)
  VALUES (v_player_id, 'player', 'Tom', 'Richard', 'Arrière Gauche', 5, true, v_team_id);
  INSERT INTO team_members (team_id, user_id, role) VALUES (v_team_id, v_player_id, 'player');

  -- Jules Moreau
  v_player_id := gen_random_uuid();
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at, confirmation_sent_at, is_sso_user)
  VALUES (v_player_id, 'jules.moreau@email.fr', crypt('Sportplus2024!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', jsonb_build_object('first_name', 'Jules', 'last_name', 'Moreau'), 'authenticated', 'authenticated', now(), now(), now(), false);
  INSERT INTO profiles (id, role, first_name, last_name, position, shirt_number, is_active, team_id)
  VALUES (v_player_id, 'player', 'Jules', 'Moreau', 'Milieu Défenseur', 6, true, v_team_id);
  INSERT INTO team_members (team_id, user_id, role) VALUES (v_team_id, v_player_id, 'player');

  -- Enzo Dubois
  v_player_id := gen_random_uuid();
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at, confirmation_sent_at, is_sso_user)
  VALUES (v_player_id, 'enzo.dubois@email.fr', crypt('Sportplus2024!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', jsonb_build_object('first_name', 'Enzo', 'last_name', 'Dubois'), 'authenticated', 'authenticated', now(), now(), now(), false);
  INSERT INTO profiles (id, role, first_name, last_name, position, shirt_number, is_active, team_id)
  VALUES (v_player_id, 'player', 'Enzo', 'Dubois', 'Milieu Central', 7, true, v_team_id);
  INSERT INTO team_members (team_id, user_id, role) VALUES (v_team_id, v_player_id, 'player');

  -- Mathis Laurent
  v_player_id := gen_random_uuid();
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at, confirmation_sent_at, is_sso_user)
  VALUES (v_player_id, 'mathis.laurent@email.fr', crypt('Sportplus2024!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', jsonb_build_object('first_name', 'Mathis', 'last_name', 'Laurent'), 'authenticated', 'authenticated', now(), now(), now(), false);
  INSERT INTO profiles (id, role, first_name, last_name, position, shirt_number, is_active, team_id)
  VALUES (v_player_id, 'player', 'Mathis', 'Laurent', 'Milieu Offensif', 8, true, v_team_id);
  INSERT INTO team_members (team_id, user_id, role) VALUES (v_team_id, v_player_id, 'player');

  -- Maxime Lefebvre
  v_player_id := gen_random_uuid();
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at, confirmation_sent_at, is_sso_user)
  VALUES (v_player_id, 'maxime.lefebvre@email.fr', crypt('Sportplus2024!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', jsonb_build_object('first_name', 'Maxime', 'last_name', 'Lefebvre'), 'authenticated', 'authenticated', now(), now(), now(), false);
  INSERT INTO profiles (id, role, first_name, last_name, position, shirt_number, is_active, team_id)
  VALUES (v_player_id, 'player', 'Maxime', 'Lefebvre', 'Ailier Droit', 9, true, v_team_id);
  INSERT INTO team_members (team_id, user_id, role) VALUES (v_team_id, v_player_id, 'player');

  -- Théo Girard
  v_player_id := gen_random_uuid();
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at, confirmation_sent_at, is_sso_user)
  VALUES (v_player_id, 'theo.girard@email.fr', crypt('Sportplus2024!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', jsonb_build_object('first_name', 'Théo', 'last_name', 'Girard'), 'authenticated', 'authenticated', now(), now(), now(), false);
  INSERT INTO profiles (id, role, first_name, last_name, position, shirt_number, is_active, team_id)
  VALUES (v_player_id, 'player', 'Théo', 'Girard', 'Ailier Gauche', 10, true, v_team_id);
  INSERT INTO team_members (team_id, user_id, role) VALUES (v_team_id, v_player_id, 'player');

  -- Noam Roux
  v_player_id := gen_random_uuid();
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at, confirmation_sent_at, is_sso_user)
  VALUES (v_player_id, 'noam.roux@email.fr', crypt('Sportplus2024!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', jsonb_build_object('first_name', 'Noam', 'last_name', 'Roux'), 'authenticated', 'authenticated', now(), now(), now(), false);
  INSERT INTO profiles (id, role, first_name, last_name, position, shirt_number, is_active, team_id)
  VALUES (v_player_id, 'player', 'Noam', 'Roux', 'Buteur', 11, true, v_team_id);
  INSERT INTO team_members (team_id, user_id, role) VALUES (v_team_id, v_player_id, 'player');

  -- Louis Simon
  v_player_id := gen_random_uuid();
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at, confirmation_sent_at, is_sso_user)
  VALUES (v_player_id, 'louis.simon@email.fr', crypt('Sportplus2024!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', jsonb_build_object('first_name', 'Louis', 'last_name', 'Simon'), 'authenticated', 'authenticated', now(), now(), now(), false);
  INSERT INTO profiles (id, role, first_name, last_name, position, shirt_number, is_active, team_id)
  VALUES (v_player_id, 'player', 'Louis', 'Simon', 'Buteur', 12, true, v_team_id);
  INSERT INTO team_members (team_id, user_id, role) VALUES (v_team_id, v_player_id, 'player');

  -- Adam Michel
  v_player_id := gen_random_uuid();
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at, confirmation_sent_at, is_sso_user)
  VALUES (v_player_id, 'adam.michel@email.fr', crypt('Sportplus2024!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', jsonb_build_object('first_name', 'Adam', 'last_name', 'Michel'), 'authenticated', 'authenticated', now(), now(), now(), false);
  INSERT INTO profiles (id, role, first_name, last_name, position, shirt_number, is_active, team_id)
  VALUES (v_player_id, 'player', 'Adam', 'Michel', 'Défenseur Central', 13, true, v_team_id);
  INSERT INTO team_members (team_id, user_id, role) VALUES (v_team_id, v_player_id, 'player');

  -- Gabriel Leroy
  v_player_id := gen_random_uuid();
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at, confirmation_sent_at, is_sso_user)
  VALUES (v_player_id, 'gabriel.leroy@email.fr', crypt('Sportplus2024!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', jsonb_build_object('first_name', 'Gabriel', 'last_name', 'Leroy'), 'authenticated', 'authenticated', now(), now(), now(), false);
  INSERT INTO profiles (id, role, first_name, last_name, position, shirt_number, is_active, team_id)
  VALUES (v_player_id, 'player', 'Gabriel', 'Leroy', 'Milieu Central', 14, true, v_team_id);
  INSERT INTO team_members (team_id, user_id, role) VALUES (v_team_id, v_player_id, 'player');

  RAISE NOTICE '14 joueurs insérés avec succès pour U14';
  RAISE NOTICE 'Mot de passe pour tous : Sportplus2024!';
END;
$$;
