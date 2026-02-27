
-- Table to store AI-generated wireframe content briefs
CREATE TABLE public.wireframe_briefs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_name TEXT NOT NULL DEFAULT '',
  site_url TEXT,
  asana_task_gid TEXT,
  asana_notes TEXT,
  setup_run_id UUID REFERENCES public.setup_runs(id),
  status TEXT NOT NULL DEFAULT 'pending',
  sections JSONB NOT NULL DEFAULT '[]'::jsonb,
  brand_context JSONB DEFAULT '{}'::jsonb,
  raw_scraped_content TEXT,
  error TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.wireframe_briefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view wireframe_briefs" ON public.wireframe_briefs FOR SELECT USING (true);
CREATE POLICY "Anyone can insert wireframe_briefs" ON public.wireframe_briefs FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update wireframe_briefs" ON public.wireframe_briefs FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete wireframe_briefs" ON public.wireframe_briefs FOR DELETE USING (true);

-- Timestamp trigger
CREATE TRIGGER update_wireframe_briefs_updated_at
  BEFORE UPDATE ON public.wireframe_briefs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
