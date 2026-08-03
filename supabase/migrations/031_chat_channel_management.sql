-- Gestion des canaux de discussion
-- 1) chat_channels : créateur + canal système "Général"
-- 2) chat_members : préférences notifications, dernière lecture, sortie du canal
-- 3) RPC get_unread_chat_counts : compteurs de messages non lus par canal
-- Idempotent.

-- ============================================================
-- 1) CHAT_CHANNELS : created_by + is_default
-- ============================================================
ALTER TABLE chat_channels ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE chat_channels ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;

-- Le canal "Général" créé à la création de l'équipe
UPDATE chat_channels SET is_default = true
WHERE channel_type = 'general' AND name = 'General';

-- Correction : les canaux créés par les utilisateurs via l'ancien code portaient
-- channel_type = 'general' ; on les requalifie en 'custom'
UPDATE chat_channels SET channel_type = 'custom'
WHERE channel_type = 'general' AND name <> 'General';

-- ============================================================
-- 2) CHAT_MEMBERS : notifications_enabled + last_read_at + left_at
-- ============================================================
ALTER TABLE chat_members ADD COLUMN IF NOT EXISTS notifications_enabled BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE chat_members ADD COLUMN IF NOT EXISTS last_read_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE chat_members ADD COLUMN IF NOT EXISTS left_at TIMESTAMPTZ;

-- Temps réel pour les badges non-lus (chat_members / chat_channels)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_members;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_channels;
  END IF;
END
$$;

-- ============================================================
-- 3) RPC : compteurs de messages non lus par canal
--    Membres : canal général (tous), parents (parents/coachs/owners),
--    coachs (coachs/owners), custom (membres explicites).
--    Un message est non lu s'il est posté après last_read_at (ou la date
--    d'arrivée dans l'équipe si aucune ligne de lecture) par un autre membre.
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
