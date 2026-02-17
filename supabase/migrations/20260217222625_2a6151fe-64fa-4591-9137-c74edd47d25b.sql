
CREATE TABLE public.email_drafts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_name TEXT NOT NULL DEFAULT '',
  call_date TIMESTAMP WITH TIME ZONE,
  subject_line TEXT NOT NULL DEFAULT '',
  draft_body TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  transcript_id UUID REFERENCES public.fireflies_transcripts(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.email_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view email_drafts"
  ON public.email_drafts FOR SELECT USING (true);

CREATE POLICY "Anyone can insert email_drafts"
  ON public.email_drafts FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update email_drafts"
  ON public.email_drafts FOR UPDATE USING (true);

CREATE POLICY "Anyone can delete email_drafts"
  ON public.email_drafts FOR DELETE USING (true);

CREATE TRIGGER update_email_drafts_updated_at
  BEFORE UPDATE ON public.email_drafts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
