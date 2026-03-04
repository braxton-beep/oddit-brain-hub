
CREATE TABLE public.setup_screenshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  setup_run_id UUID REFERENCES public.setup_runs(id) ON DELETE CASCADE,
  client_name TEXT NOT NULL DEFAULT '',
  section_name TEXT NOT NULL DEFAULT '',
  section_order INTEGER NOT NULL DEFAULT 0,
  device_type TEXT NOT NULL DEFAULT 'desktop',
  y_start_pct NUMERIC NOT NULL DEFAULT 0,
  y_end_pct NUMERIC NOT NULL DEFAULT 0,
  storage_url TEXT,
  full_screenshot_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.setup_screenshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view setup_screenshots" ON public.setup_screenshots FOR SELECT USING (true);
CREATE POLICY "Service role can manage setup_screenshots" ON public.setup_screenshots FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER update_setup_screenshots_updated_at
  BEFORE UPDATE ON public.setup_screenshots
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
