
-- Create figma_projects table for storing which Figma projects/teams to sync
CREATE TABLE public.figma_projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id TEXT NOT NULL,
  project_name TEXT NOT NULL DEFAULT '',
  team_id TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.figma_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view figma_projects"
  ON public.figma_projects FOR SELECT USING (true);
CREATE POLICY "Anyone can insert figma_projects"
  ON public.figma_projects FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update figma_projects"
  ON public.figma_projects FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete figma_projects"
  ON public.figma_projects FOR DELETE USING (true);

-- Create figma_files table for storing parsed Figma file metadata
CREATE TABLE public.figma_files (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  figma_file_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  design_type TEXT NOT NULL DEFAULT 'unknown',
  client_name TEXT,
  thumbnail_url TEXT,
  figma_url TEXT,
  last_modified TIMESTAMP WITH TIME ZONE,
  project_id TEXT,
  project_name TEXT,
  tags TEXT[] DEFAULT '{}',
  raw_metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.figma_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view figma_files"
  ON public.figma_files FOR SELECT USING (true);
CREATE POLICY "Anyone can insert figma_files"
  ON public.figma_files FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update figma_files"
  ON public.figma_files FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete figma_files"
  ON public.figma_files FOR DELETE USING (true);

-- Triggers for updated_at
CREATE TRIGGER update_figma_projects_updated_at
  BEFORE UPDATE ON public.figma_projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_figma_files_updated_at
  BEFORE UPDATE ON public.figma_files
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
