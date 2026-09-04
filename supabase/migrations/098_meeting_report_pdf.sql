ALTER TABLE public.parent_meetings
  ADD COLUMN IF NOT EXISTS report_pdf_url TEXT;

COMMENT ON COLUMN public.parent_meetings.report_pdf_url IS
  'URL du PDF du compte-rendu de reunion, stocke dans Supabase Storage';
