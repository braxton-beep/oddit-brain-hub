-- Add unique constraint on project_id for upsert support from team discovery
ALTER TABLE public.figma_projects ADD CONSTRAINT figma_projects_project_id_key UNIQUE (project_id);