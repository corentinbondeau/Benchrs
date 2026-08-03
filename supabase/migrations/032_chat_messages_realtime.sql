-- Publie chat_messages en temps réel : messages en direct sur la page chat
-- ET mise à jour des badges non-lus (useChatUnread écoute les INSERT).
-- Idempotent (les tables déjà publiées sont ignorées par ADD TABLE).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
  END IF;
END
$$;
