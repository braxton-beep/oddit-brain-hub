
-- Track each Asana card that gets processed through the setup pipeline
CREATE TABLE public.setup_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  asana_task_gid TEXT NOT NULL,
  client_name TEXT NOT NULL DEFAULT '',
  tier TEXT NOT NULL DEFAULT 'pro',
  shop_url TEXT,
  focus_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | running | done | error
  steps JSONB,
  figma_file_link TEXT,
  figma_slides_link TEXT,
  asana_url TEXT,
  error TEXT,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Prevent duplicate runs for the same card
CREATE UNIQUE INDEX setup_runs_task_gid_unique ON public.setup_runs (asana_task_gid);

-- Enable RLS (this data is internal/admin only, no user-based access needed)
ALTER TABLE public.setup_runs ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read (internal tool)
CREATE POLICY "Authenticated users can read setup runs"
  ON public.setup_runs FOR SELECT
  USING (true);

-- Allow service role to insert/update (edge function uses service role)
CREATE POLICY "Service role can manage setup runs"
  ON public.setup_runs FOR ALL
  USING (true)
  WITH CHECK (true);

-- Timestamp trigger
CREATE TRIGGER update_setup_runs_updated_at
  BEFORE UPDATE ON public.setup_runs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime so the UI can get live updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.setup_runs;
