-- Canal privé par joueur : messagerie directe coach <-> parents
-- 1) chat_channels.player_id (canal rattaché à un joueur)
-- 2) RLS durcie : les canaux "player" ne sont visibles (channels + messages)
--    que par leurs membres (coachs de l'équipe + parents du joueur).
-- 3) RPC get_unread_chat_counts : compteurs pour les canaux player.
-- Idempotent.

-- ============================================================
-- 1) CHAT_CHANNELS : player_id
-- ============================================================
ALTER TABLE chat_channels ADD COLUMN IF NOT EXISTS player_id UUID REFERENCES profiles(id) ON DELETE CASCADE;

-- Un seul canal privé par (équipe, joueur)
DROP INDEX IF EXISTS chat_channels_team_player_idx;
CREATE UNIQUE INDEX chat_channels_team_player_idx
  ON chat_channels (team_id, player_id)
  WHERE player_id IS NOT NULL;

-- ============================================================
-- 2) RLS durcie (les politiques ci-dessous ne référencent que des
--    tables différentes de la table protégée -> pas de récursion).
-- ============================================================

-- --- CHAT_CHANNELS : un canal "player" n'est visible que par ses membres
DROP POLICY IF EXISTS "Members can view chat_channels" ON chat_channels;
CREATE POLICY "Members can view chat_channels"
  ON chat_channels FOR SELECT
  USING (
    team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())
    AND (
      player_id IS NULL
      OR EXISTS (
        SELECT 1 FROM chat_members cm
        WHERE cm.channel_id = chat_channels.id
          AND cm.user_id = auth.uid()
          AND cm.left_at IS NULL
      )
    )
  );

-- Seuls les coachs/owners gèrent les canaux "player" (pas de renommage/suppression sauvage)
DROP POLICY IF EXISTS "Members can manage chat_channels" ON chat_channels;
CREATE POLICY "Members can manage chat_channels"
  ON chat_channels FOR ALL
  USING (
    team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())
    AND (
      player_id IS NULL
      OR EXISTS (
        SELECT 1 FROM team_members tm
        WHERE tm.team_id = chat_channels.team_id
          AND tm.user_id = auth.uid()
          AND tm.role IN ('coach','owner')
      )
    )
  )
  WITH CHECK (
    team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())
    AND (
      player_id IS NULL
      OR EXISTS (
        SELECT 1 FROM team_members tm
        WHERE tm.team_id = chat_channels.team_id
          AND tm.user_id = auth.uid()
          AND tm.role IN ('coach','owner')
      )
    )
  );

-- --- CHAT_MESSAGES : messages des canaux "player" réservés à leurs membres
DROP POLICY IF EXISTS "Members can view chat_messages" ON chat_messages;
CREATE POLICY "Members can view chat_messages"
  ON chat_messages FOR SELECT
  USING (
    team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())
    AND (
      EXISTS (
        SELECT 1 FROM chat_channels cc
        WHERE cc.id = chat_messages.channel_id AND cc.player_id IS NULL
      )
      OR EXISTS (
        SELECT 1 FROM chat_members cm
        WHERE cm.channel_id = chat_messages.channel_id
          AND cm.user_id = auth.uid()
          AND cm.left_at IS NULL
      )
    )
  );

-- --- CHAT_MEMBERS : INSERT restreint (coach pour les canaux player), mise à
--    jour/sortie de SA propre ligne possible. Empêche un parent de s'auto-ajouter
--    au canal privé d'un autre joueur.
DROP POLICY IF EXISTS "Members can manage chat_members" ON chat_members;

CREATE POLICY "Members can insert chat_members"
  ON chat_members FOR INSERT
  WITH CHECK (
    team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())
    AND (
      EXISTS (
        SELECT 1 FROM chat_channels cc
        WHERE cc.id = chat_members.channel_id AND cc.player_id IS NULL
      )
      OR EXISTS (
        SELECT 1 FROM team_members tm
        WHERE tm.team_id = chat_members.team_id
          AND tm.user_id = auth.uid()
          AND tm.role IN ('coach','owner')
      )
    )
  );

CREATE POLICY "Members can update chat_members"
  ON chat_members FOR UPDATE
  USING (
    team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())
    AND (
      user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM team_members tm
        WHERE tm.team_id = chat_members.team_id
          AND tm.user_id = auth.uid()
          AND tm.role IN ('coach','owner')
      )
    )
  );

CREATE POLICY "Members can delete chat_members"
  ON chat_members FOR DELETE
  USING (
    team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())
    AND (
      user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM team_members tm
        WHERE tm.team_id = chat_members.team_id
          AND tm.user_id = auth.uid()
          AND tm.role IN ('coach','owner')
      )
    )
  );

-- ============================================================
-- 3) RPC get_unread_chat_counts : canaux player = membres explicites
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_unread_chat_counts(p_team_id uuid)
RETURNS TABLE (channel_id uuid, unread bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ctx AS (
    SELECT role, created_at AS joined_at
    FROM team_members
    WHERE team_id = p_team_id AND user_id = auth.uid()
  ),
  my_channels AS (
    SELECT c.id AS channel_id,
           COALESCE(m.last_read_at, ctx.joined_at) AS last_read_at
    FROM chat_channels c
    LEFT JOIN chat_members m ON m.channel_id = c.id AND m.user_id = auth.uid()
    CROSS JOIN ctx
    WHERE c.team_id = p_team_id
      AND (
        (c.channel_type = 'general' AND (m.left_at IS NULL))
        OR (c.channel_type = 'parents' AND ctx.role IN ('parent','coach','owner') AND (m.left_at IS NULL))
        OR (c.channel_type = 'coaches' AND ctx.role IN ('coach','owner') AND (m.left_at IS NULL))
        OR (c.channel_type = 'custom' AND m.user_id IS NOT NULL)
        OR (c.channel_type = 'player' AND m.user_id IS NOT NULL)
      )
  )
  SELECT mc.channel_id, COUNT(msg.id)::bigint AS unread
  FROM my_channels mc
  LEFT JOIN chat_messages msg
    ON msg.channel_id = mc.channel_id
   AND msg.created_at > mc.last_read_at
   AND msg.sender_id <> auth.uid()
  GROUP BY mc.channel_id
  HAVING COUNT(msg.id) > 0;
$$;
