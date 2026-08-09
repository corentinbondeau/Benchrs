-- 054_training_templates.sql
-- Templates de séances : sauvegarder une fiche IA/manuelle pour la réutiliser
-- en 1 clic (sur une autre séance) ou créer une série d'entraînements hebdo.

CREATE TABLE IF NOT EXISTS public.training_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'ai')),
  exercises JSONB NOT NULL DEFAULT '[]',
  objectives JSONB,
  notes TEXT,
  visibility TEXT NOT NULL DEFAULT 'coach' CHECK (visibility IN ('coach', 'team')),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_training_templates_team ON public.training_templates(team_id);

ALTER TABLE public.training_templates ENABLE ROW LEVEL SECURITY;

-- Lecture : membres ; gestion : coach
DROP POLICY IF EXISTS "Members can view training_templates" ON public.training_templates;
CREATE POLICY "Members can view training_templates"
  ON public.training_templates FOR SELECT
  USING (team_id IN (SELECT public.user_visible_team_ids()));

DROP POLICY IF EXISTS "Coaches can manage training_templates" ON public.training_templates;
CREATE POLICY "Coaches can manage training_templates"
  ON public.training_templates FOR ALL
  USING (public.is_team_coach(team_id))
  WITH CHECK (public.is_team_coach(team_id));
