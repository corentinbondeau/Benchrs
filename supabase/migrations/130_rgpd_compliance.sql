-- 130_rgpd_compliance.sql
-- Conformité RGPD : cascades de suppression, journal d'audit, rétention

BEGIN;

-- 1) Journal d'audit RGPD
CREATE TABLE IF NOT EXISTS public.rgpd_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  ip_address text,
  user_agent text,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rgpd_audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rgpd_audit_admin_only" ON public.rgpd_audit_logs;
CREATE POLICY "rgpd_audit_admin_only" ON public.rgpd_audit_logs
  FOR ALL USING (false);

-- 2) Politique de rétention (configurable)
CREATE TABLE IF NOT EXISTS public.rgpd_retention_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL UNIQUE,
  retention_days integer NOT NULL CHECK (retention_days >= 0),
  action text NOT NULL CHECK (action IN ('delete','anonymize')),
  description text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rgpd_retention_policies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rgpd_retention_read_all" ON public.rgpd_retention_policies;
CREATE POLICY "rgpd_retention_read_all" ON public.rgpd_retention_policies
  FOR SELECT USING (auth.uid() IS NOT NULL);

INSERT INTO public.rgpd_retention_policies (table_name, retention_days, action, description) VALUES
  ('notifications', 365, 'delete', 'Notifications au-delà de 12 mois'),
  ('chat_messages', 730, 'delete', 'Messages au-delà de 24 mois'),
  ('rgpd_audit_logs', 1095, 'delete', 'Logs RGPD au-delà de 36 mois')
ON CONFLICT (table_name) DO NOTHING;

-- 3) Consentements
CREATE TABLE IF NOT EXISTS public.user_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  consent_type text NOT NULL CHECK (consent_type IN ('cgu','privacy','data_processing','health_data','parental','marketing')),
  granted boolean NOT NULL DEFAULT false,
  granted_at timestamptz,
  revoked_at timestamptz,
  ip_address text,
  user_agent text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, consent_type)
);

ALTER TABLE public.user_consents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own consents" ON public.user_consents;
CREATE POLICY "Users manage own consents" ON public.user_consents
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 4) Corriger les FK critiques vers profiles sans ON DELETE
-- created_by sans cascade -> SET NULL quand possible
DO $$
DECLARE
  r record;
BEGIN
  -- events.created_by
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='events') THEN
    BEGIN
      ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_created_by_fkey;
      ALTER TABLE public.events ADD CONSTRAINT events_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  -- injuries.reported_by
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='injuries') THEN
    BEGIN
      ALTER TABLE public.injuries DROP CONSTRAINT IF EXISTS injuries_reported_by_fkey;
      ALTER TABLE public.injuries ADD CONSTRAINT injuries_reported_by_fkey FOREIGN KEY (reported_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  -- tasks.assigned_to
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='tasks') THEN
    BEGIN
      ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_assigned_to_fkey;
      ALTER TABLE public.tasks ADD CONSTRAINT tasks_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.profiles(id) ON DELETE SET NULL;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  -- trophies.awarded_to, awarded_by
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='trophies') THEN
    BEGIN
      ALTER TABLE public.trophies DROP CONSTRAINT IF EXISTS trophies_awarded_to_fkey;
      ALTER TABLE public.trophies ADD CONSTRAINT trophies_awarded_to_fkey FOREIGN KEY (awarded_to) REFERENCES public.profiles(id) ON DELETE SET NULL;
      ALTER TABLE public.trophies DROP CONSTRAINT IF EXISTS trophies_awarded_by_fkey;
      ALTER TABLE public.trophies ADD CONSTRAINT trophies_awarded_by_fkey FOREIGN KEY (awarded_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  -- gallery_media.uploaded_by
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='gallery_media') THEN
    BEGIN
      ALTER TABLE public.gallery_media DROP CONSTRAINT IF EXISTS gallery_media_uploaded_by_fkey;
      ALTER TABLE public.gallery_media ADD CONSTRAINT gallery_media_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  -- match_events.player_id/related_player_id/created_by
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='match_events') THEN
    BEGIN
      ALTER TABLE public.match_events DROP CONSTRAINT IF EXISTS match_events_player_id_fkey;
      ALTER TABLE public.match_events ADD CONSTRAINT match_events_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
      ALTER TABLE public.match_events DROP CONSTRAINT IF EXISTS match_events_related_player_id_fkey;
      ALTER TABLE public.match_events ADD CONSTRAINT match_events_related_player_id_fkey FOREIGN KEY (related_player_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
      ALTER TABLE public.match_events DROP CONSTRAINT IF EXISTS match_events_created_by_fkey;
      ALTER TABLE public.match_events ADD CONSTRAINT match_events_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  -- cotisations.recorded_by, payment_history.recorded_by
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='cotisations') THEN
    BEGIN
      ALTER TABLE public.cotisations DROP CONSTRAINT IF EXISTS cotisations_recorded_by_fkey;
      ALTER TABLE public.cotisations ADD CONSTRAINT cotisations_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='payment_history') THEN
    BEGIN
      ALTER TABLE public.payment_history DROP CONSTRAINT IF EXISTS payment_history_recorded_by_fkey;
      ALTER TABLE public.payment_history ADD CONSTRAINT payment_history_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  -- chat_messages.sender_id already SET NULL, keep
  -- chat_channels.created_by already SET NULL
END $$;

-- 5) Fonction de purge RGPD (à appeler par cron)
CREATE OR REPLACE FUNCTION public.purge_rgpd_expired()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_res jsonb = '[]'::jsonb;
  v_cnt integer;
BEGIN
  -- notifications
  DELETE FROM public.notifications WHERE created_at < now() - interval '365 days';
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  v_res = v_res || jsonb_build_object('table','notifications','deleted',v_cnt);

  -- chat_messages
  DELETE FROM public.chat_messages WHERE created_at < now() - interval '730 days';
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  v_res = v_res || jsonb_build_object('table','chat_messages','deleted',v_cnt);

  -- rgpd_audit_logs
  DELETE FROM public.rgpd_audit_logs WHERE created_at < now() - interval '1095 days';
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  v_res = v_res || jsonb_build_object('table','rgpd_audit_logs','deleted',v_cnt);

  RETURN v_res;
END;
$$;

COMMIT;
