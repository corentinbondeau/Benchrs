-- Convocation scheduling + per-team profile visibility
-- Idempotent: safe to re-run

-- 1) Events: number of days before the event the convocations are sent
ALTER TABLE events ADD COLUMN IF NOT EXISTS convocation_lead_days INTEGER NOT NULL DEFAULT 3;

-- 2) Notifications: allow scheduling the push delivery and tracking it
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_notifications_scheduled
  ON notifications(scheduled_for)
  WHERE delivered_at IS NULL;

-- 3) Fix profiles SELECT policy so any member can view the profile of any
--    user they share a team with (per-team roles / multi-team support).
--    team_id on profiles is single-valued and gets overwritten when a user
--    joins several teams, so scoping by team_id alone breaks roster views.
DROP POLICY IF EXISTS "Members can view team profiles" ON public.profiles;

CREATE POLICY "Members can view team profiles"
  ON public.profiles FOR SELECT
  USING (
    auth.uid() = id
    OR id IN (
      SELECT tm.user_id FROM public.team_members tm
      WHERE tm.team_id IN (SELECT public.user_team_ids())
    )
  );
