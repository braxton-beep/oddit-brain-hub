
CREATE TABLE public.pipeline_projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client TEXT NOT NULL DEFAULT '',
  page TEXT NOT NULL DEFAULT '',
  stages JSONB NOT NULL DEFAULT '[
    {"name":"Figma Pull","status":"pending"},
    {"name":"Section Split","status":"pending"},
    {"name":"Code Gen","status":"pending"},
    {"name":"QA","status":"pending"},
    {"name":"Refinement","status":"pending"}
  ]'::jsonb,
  last_update TEXT NOT NULL DEFAULT 'Just now',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.pipeline_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view pipeline_projects"
  ON public.pipeline_projects FOR SELECT USING (true);

CREATE POLICY "Anyone can insert pipeline_projects"
  ON public.pipeline_projects FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update pipeline_projects"
  ON public.pipeline_projects FOR UPDATE USING (true);

CREATE POLICY "Anyone can delete pipeline_projects"
  ON public.pipeline_projects FOR DELETE USING (true);

CREATE TRIGGER update_pipeline_projects_updated_at
  BEFORE UPDATE ON public.pipeline_projects
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
