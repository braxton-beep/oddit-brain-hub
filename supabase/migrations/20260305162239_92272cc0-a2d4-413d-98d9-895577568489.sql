-- Add design_data column to store extracted styles, node tree, and frame export URLs
ALTER TABLE public.figma_files ADD COLUMN IF NOT EXISTS design_data jsonb DEFAULT '{}'::jsonb;

-- Comment for clarity
COMMENT ON COLUMN public.figma_files.design_data IS 'Stores extracted Figma styles (colors, typography, effects), node structure, and exported frame URLs for AI context';

-- Create storage bucket for exported Figma frame images
INSERT INTO storage.buckets (id, name, public)
VALUES ('figma-exports', 'figma-exports', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access to figma-exports
CREATE POLICY "Public read access for figma exports"
ON storage.objects FOR SELECT
USING (bucket_id = 'figma-exports');

-- Allow service role to upload
CREATE POLICY "Service role upload for figma exports"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'figma-exports');