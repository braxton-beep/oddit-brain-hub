
CREATE TABLE public.generated_sections (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pipeline_project_id uuid NOT NULL REFERENCES public.pipeline_projects(id) ON DELETE CASCADE,
  section_name text NOT NULL DEFAULT '',
  liquid_code text NOT NULL DEFAULT '',
  css_code text NOT NULL DEFAULT '',
  js_code text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'generated',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.generated_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view generated_sections" ON public.generated_sections FOR SELECT USING (true);
CREATE POLICY "Anyone can insert generated_sections" ON public.generated_sections FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update generated_sections" ON public.generated_sections FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete generated_sections" ON public.generated_sections FOR DELETE USING (true);

CREATE TRIGGER update_generated_sections_updated_at
  BEFORE UPDATE ON public.generated_sections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
