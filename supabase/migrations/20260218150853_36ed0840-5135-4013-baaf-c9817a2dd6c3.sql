-- Google Drive folders (scoping, like figma_projects)
CREATE TABLE IF NOT EXISTS public.google_drive_folders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  folder_id TEXT NOT NULL UNIQUE,
  folder_name TEXT NOT NULL DEFAULT '',
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.google_drive_folders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view google_drive_folders" ON public.google_drive_folders FOR SELECT USING (true);
CREATE POLICY "Anyone can insert google_drive_folders" ON public.google_drive_folders FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update google_drive_folders" ON public.google_drive_folders FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete google_drive_folders" ON public.google_drive_folders FOR DELETE USING (true);

CREATE TRIGGER update_google_drive_folders_updated_at
  BEFORE UPDATE ON public.google_drive_folders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Google Drive files (synced metadata + tags)
CREATE TABLE IF NOT EXISTS public.google_drive_files (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  drive_file_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  mime_type TEXT NOT NULL DEFAULT '',
  doc_type TEXT NOT NULL DEFAULT 'other',
  client_name TEXT,
  folder_id TEXT,
  folder_name TEXT,
  drive_url TEXT,
  thumbnail_url TEXT,
  last_modified TIMESTAMP WITH TIME ZONE,
  tags TEXT[] DEFAULT '{}',
  raw_metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.google_drive_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view google_drive_files" ON public.google_drive_files FOR SELECT USING (true);
CREATE POLICY "Anyone can insert google_drive_files" ON public.google_drive_files FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update google_drive_files" ON public.google_drive_files FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete google_drive_files" ON public.google_drive_files FOR DELETE USING (true);

CREATE TRIGGER update_google_drive_files_updated_at
  BEFORE UPDATE ON public.google_drive_files
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
