-- Ajout du joueur Kais Ryckebusch dans l'équipe U14 (club ECC)
-- Sans poste ni numéro de maillot (à renseigner plus tard depuis l'app)
-- À exécuter dans le SQL Editor de Supabase (Dashboard > SQL Editor)

DO $$
DECLARE
  v_club_id UUID;
  v_team_id UUID;
  v_player_id UUID;
  v_email TEXT := 'kais.ryckebusch@email.fr';
BEGIN
  -- Club ECC
  SELECT id INTO v_club_id FROM clubs WHERE name = 'ECC';
  IF v_club_id IS NULL THEN
    RAISE EXCEPTION 'Club ECC introuvable';
  END IF;

  -- Équipe U14
  SELECT id INTO v_team_id FROM teams WHERE name = 'U14' AND club_id = v_club_id;
  IF v_team_id IS NULL THEN
    RAISE EXCEPTION 'Équipe U14 introuvable pour le club ECC';
  END IF;

  -- Idempotence : ne rien faire si l'utilisateur existe déjà
  SELECT id INTO v_player_id FROM auth.users WHERE email = v_email;
  IF v_player_id IS NOT NULL THEN
    RAISE NOTICE 'Kais Ryckebusch existe déjà (%), aucune insertion.', v_player_id;
    RETURN;
  END IF;

  v_player_id := gen_random_uuid();

  INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at, confirmation_sent_at, is_sso_user)
  VALUES (v_player_id, '00000000-0000-0000-0000-000000000000', v_email, crypt('Sportplus2024!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', jsonb_build_object('first_name', 'Kais', 'last_name', 'Ryckebusch'), 'authenticated', 'authenticated', now(), now(), now(), false);

  -- OBLIGATOIRE : sans cette identité, GoTrue renvoie 400 "Invalid login credentials"
  INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at)
  VALUES (
    gen_random_uuid(),
    v_player_id,
    v_player_id::text,
    jsonb_build_object('sub', v_player_id::text, 'email', v_email, 'email_verified', true, 'phone_verified', false),
    'email',
    now(),
    now()
  );

  INSERT INTO profiles (id, role, first_name, last_name, position, shirt_number, is_active, team_id)
  VALUES (v_player_id, 'player', 'Kais', 'Ryckebusch', NULL, NULL, true, v_team_id);

  INSERT INTO team_members (team_id, user_id, role)
  VALUES (v_team_id, v_player_id, 'player');

  RAISE NOTICE 'Joueur Kais Ryckebusch inséré dans U14 (id: %)', v_player_id;
  RAISE NOTICE 'Mot de passe : Sportplus2024!';
END;
$$;
