-- Insère les 14 joueurs de l'équipe U100 (club ECC)
-- À exécuter dans le SQL Editor de Supabase (Dashboard > SQL Editor)
--
-- Script idempotent : rejouable sans créer de doublon.
-- NOTE : la ligne auth.identities est OBLIGATOIRE, sinon GoTrue renvoie
--        400 "Invalid login credentials" au login.
--
-- POURQUOI UNE FONCTION SECURITY DEFINER :
--   Les policies RLS interdisent les INSERT hors du contexte du user lui-même
--   (profiles : WITH CHECK auth.uid() = id ; team_members : rôles limités).
--   Une session SQL Editor normale n'est PAS superuser → les inserts profiles
--   sont rejetés silencieusement. La fonction ci-dessous est créée par postgres
--   (le SQL Editor standard) et s'exécute AVEC les droits de postgres :
--   la RLS est contournée, exactement comme les helpers SECURITY DEFINER de
--   l'application (is_global_coach, user_team_ids, RPC VMA/VMI, ...).
--   search_path est figé à l'exécution pour éviter les attaques de hijacking.
--
-- Diagnostics en bas de sortie (onglet Messages) :
--   "X joueur(s) ajouté(s), Y déjà existant(s) (ignoré(s)), Z en échec"
--   + un WARNING par ligne en échec avec le message d'erreur exact.
-- Un échec sur une ligne n'arrête pas le script.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- Fonction d'insert : SECURITY DEFINER (owner postgres) -> RLS désactivée
-- ============================================================
CREATE OR REPLACE FUNCTION public.seed_u100_players()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_club_id UUID;
  v_team_id UUID;
  v_player_id UUID;
  v_email TEXT;
  v_created INTEGER := 0;
  v_skipped INTEGER := 0;
  v_failed INTEGER := 0;
  v_has_instance_id BOOLEAN;
  r RECORD;
BEGIN
  -- Détecte si le schéma auth.users de cette instance possède encore la
  -- colonne instance_id (retirée dans les schémas récents).
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'instance_id'
  ) INTO v_has_instance_id;

  -- Club ECC
  SELECT id INTO v_club_id FROM public.clubs WHERE name = 'ECC';
  IF v_club_id IS NULL THEN
    INSERT INTO public.clubs (name) VALUES ('ECC') RETURNING id INTO v_club_id;
  END IF;

  -- Équipe U100
  SELECT id INTO v_team_id FROM public.teams WHERE name = 'U100' AND club_id = v_club_id;
  IF v_team_id IS NULL THEN
    INSERT INTO public.teams (club_id, name, invite_code)
    VALUES (v_club_id, 'U100', 'p1n8cz0ktgzh')
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
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    -- Chaque joueur dans un sous-bloc : une erreur sur une ligne est loggée
    -- (WARNING) et on passe au suivant, sans faire échouer tout le script.
    BEGIN
      v_player_id := gen_random_uuid();

      IF v_has_instance_id THEN
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
      ELSE
        INSERT INTO auth.users (
          id, email, encrypted_password, email_confirmed_at,
          raw_app_meta_data, raw_user_meta_data, aud, role,
          created_at, updated_at, confirmation_sent_at, is_sso_user
        )
        VALUES (
          v_player_id,
          v_email,
          crypt('Sportplus2024!', gen_salt('bf')),
          now(),
          '{"provider":"email","providers":["email"]}',
          jsonb_build_object('first_name', r.first_name, 'last_name', r.last_name),
          'authenticated', 'authenticated',
          now(), now(), now(), false
        );
      END IF;

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

      INSERT INTO public.profiles (id, role, first_name, last_name, position, shirt_number, is_active, team_id)
      VALUES (v_player_id, 'player', r.first_name, r.last_name, r.position, r.shirt_number, true, v_team_id);

      INSERT INTO public.team_members (team_id, user_id, role)
      VALUES (v_team_id, v_player_id, 'player');

      v_created := v_created + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'ÉCHEC création % (%) : %', r.first_name, v_email, SQLERRM;
      v_failed := v_failed + 1;
    END;
  END LOOP;

  RETURN v_created || ' joueur(s) ajouté(s), ' || v_skipped || ' déjà existant(s) (ignoré(s)), '
         || v_failed || ' en échec — équipe U100 (mot de passe : Sportplus2024!)';
END;
$$;

-- ============================================================
-- Exécution : elle tourne SECURITY DEFINER (postgres) => RLS contournée,
-- les profiles/team_members sont bien créés même hors user authentifié.
-- ============================================================
SELECT public.seed_u100_players() AS resultat;