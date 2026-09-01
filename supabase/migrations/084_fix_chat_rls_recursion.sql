-- 084_fix_chat_rls_recursion.sql
--
-- INCIDENT PRODUCTION :
--   ERROR: 42P17: infinite recursion detected in policy for relation "chat_channels"
--   Toute lecture de chat_channels échoue en 500 -> le chat est totalement inutilisable.
--
-- CAUSE : récursion mutuelle entre policies RLS
--   - "Members can view chat_channels" (071, l.88-138) fait 4x un EXISTS sur
--     chat_members (auto.uid() IN chat_members WHERE channel_id = chat_channels.id)
--     -> déclenche la RLS de chat_members.
--   - "Members can view chat_members" (072, l.278-297) fait un EXISTS sur
--     chat_channels (cc.id = chat_members.channel_id AND cc.player_id IS NULL
--     AND cc.channel_type IN ('general','parents','coaches'))
--     -> déclenche la RLS de chat_channels.
--   => chat_channels appelle chat_members qui rappelle chat_channels : boucle infinie.
--
--   Une 3e référence croisée existe côté écriture : "Members can insert chat_members"
--   (071, l.219+) interroge chat_channels à plusieurs reprises dans son WITH CHECK,
--   ce qui rejoue la même boucle à l'insertion.
--
-- PRINCIPE DU CORRECTIF (règle déjà énoncée dans 072, section 9) :
--   « jamais de sous-query sur la table protégée par une AUTRE policy RLS qui
--     référence la table en cours -> passer par un helper SECURITY DEFINER »
--   072 l'applique déjà pour l'auto-référence chat_members -> chat_members
--   (is_chat_member). Cette migration l'applique aux références CROISÉES :
--     - chat_channels -> chat_members  (déjà couvert par is_chat_member, réutilisé)
--     - chat_members  -> chat_channels (nouveaux helpers ci-dessous)
--
--   Aucune condition de visibilité n'est modifiée : uniquement la façon de
--   les exprimer (sous-requête directe -> fonction SECURITY DEFINER STABLE).
--
-- Idempotent : peut être relancé sans risque.

-- ============================================================
-- HELPERS SECURITY DEFINER (mêmes attributs que is_chat_member de 072 :
-- LANGUAGE sql, STABLE, SECURITY DEFINER, SET search_path = public)
-- ============================================================

-- Retourne le team_id d'un canal (remplace la sous-requête scalaire
-- `SELECT cc.team_id FROM chat_channels cc WHERE cc.id = ...` de 071 l.223).
CREATE OR REPLACE FUNCTION public.chat_channel_team_id(p_channel_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cc.team_id FROM public.chat_channels cc WHERE cc.id = p_channel_id;
$$;

-- Retourne le channel_type d'un canal (remplace les sous-requêtes
-- `cc.channel_type = 'general' / 'parents' / 'coaches'` de 071 l.240-257).
CREATE OR REPLACE FUNCTION public.chat_channel_type(p_channel_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cc.channel_type FROM public.chat_channels cc WHERE cc.id = p_channel_id;
$$;

-- Vrai si le canal est un canal 'custom' créé par l'utilisateur courant
-- (remplace l'EXISTS de 071 l.230-234).
CREATE OR REPLACE FUNCTION public.is_own_custom_channel(p_channel_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_channels cc
    WHERE cc.id = p_channel_id
      AND cc.channel_type = 'custom'
      AND cc.created_by = auth.uid()
  );
$$;

-- Vrai si le canal est un canal "ouvert à l'équipe" (pas un canal joueur,
-- de type general/parents/coaches) — remplace l'EXISTS de 072 l.283-288.
CREATE OR REPLACE FUNCTION public.is_open_team_channel(p_channel_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_channels cc
    WHERE cc.id = p_channel_id
      AND cc.player_id IS NULL
      AND cc.channel_type IN ('general', 'parents', 'coaches')
  );
$$;

-- ============================================================
-- 1) CHAT_CHANNELS : "Members can view chat_channels"
--    (identique à 071 l.88-138, les 4 EXISTS sur chat_members
--     remplacés par is_chat_member, déjà défini en 072)
-- ============================================================
DROP POLICY IF EXISTS "Members can view chat_channels" ON public.chat_channels;
CREATE POLICY "Members can view chat_channels"
  ON public.chat_channels FOR SELECT
  USING (
    team_id IN (SELECT public.user_visible_team_ids())
    AND (
      channel_type = 'general'
      OR (
        channel_type = 'parents'
        AND (
          EXISTS (
            SELECT 1 FROM public.team_members tm
            WHERE tm.team_id = chat_channels.team_id AND tm.user_id = auth.uid()
              AND tm.role IN ('parent','coach','owner')
          )
          OR public.is_chat_member(chat_channels.id)
        )
      )
      OR (
        channel_type = 'coaches'
        AND (
          EXISTS (
            SELECT 1 FROM public.team_members tm
            WHERE tm.team_id = chat_channels.team_id AND tm.user_id = auth.uid()
              AND tm.role IN ('coach','owner')
          )
          OR public.is_chat_member(chat_channels.id)
        )
      )
      OR (
        channel_type IN ('custom','player')
        AND (
          public.is_chat_member(chat_channels.id)
          OR EXISTS (
            SELECT 1 FROM public.team_members tm
            WHERE tm.team_id = chat_channels.team_id AND tm.user_id = auth.uid()
              AND tm.role IN ('coach','owner')
          )
        )
      )
    )
  );

-- ============================================================
-- 2) CHAT_MEMBERS : "Members can view chat_members"
--    (identique à 072 l.278-297, l'EXISTS sur chat_channels
--     remplacé par is_open_team_channel)
-- ============================================================
DROP POLICY IF EXISTS "Members can view chat_members" ON public.chat_members;
CREATE POLICY "Members can view chat_members"
  ON public.chat_members FOR SELECT
  USING (
    team_id IN (SELECT public.user_visible_team_ids())
    AND (
      public.is_open_team_channel(chat_members.channel_id)
      OR public.is_chat_member(chat_members.channel_id)
      OR EXISTS (
        SELECT 1 FROM public.team_members tm
        WHERE tm.team_id = chat_members.team_id
          AND tm.user_id = auth.uid()
          AND tm.role IN ('coach','owner')
      )
    )
  );

-- ============================================================
-- 3) CHAT_MEMBERS : "Members can insert chat_members"
--    (identique à 071 l.219-262, les références à chat_channels
--     remplacées par chat_channel_team_id / is_own_custom_channel /
--     chat_channel_type)
-- ============================================================
DROP POLICY IF EXISTS "Members can insert chat_members" ON public.chat_members;
CREATE POLICY "Members can insert chat_members"
  ON public.chat_members FOR INSERT
  WITH CHECK (
    team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid())
    AND team_id = public.chat_channel_team_id(chat_members.channel_id)
    AND (
      EXISTS (
        SELECT 1 FROM public.team_members tm
        WHERE tm.team_id = chat_members.team_id AND tm.user_id = auth.uid()
          AND tm.role IN ('coach','owner')
      )
      OR public.is_own_custom_channel(chat_members.channel_id)
      OR (
        user_id = auth.uid()
        AND (
          public.chat_channel_type(chat_members.channel_id) = 'general'
          OR (
            public.chat_channel_type(chat_members.channel_id) = 'parents'
            AND EXISTS (
              SELECT 1 FROM public.team_members tm
              WHERE tm.team_id = chat_members.team_id AND tm.user_id = auth.uid()
                AND tm.role IN ('parent','coach','owner')
            )
          )
          OR (
            public.chat_channel_type(chat_members.channel_id) = 'coaches'
            AND EXISTS (
              SELECT 1 FROM public.team_members tm
              WHERE tm.team_id = chat_members.team_id AND tm.user_id = auth.uid()
                AND tm.role IN ('coach','owner')
            )
          )
        )
      )
    )
  );
