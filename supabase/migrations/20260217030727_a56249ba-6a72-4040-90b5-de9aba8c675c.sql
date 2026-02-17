
-- Create table for CRO audit reports
CREATE TABLE public.cro_audits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_url TEXT NOT NULL,
  client_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'generating',
  screenshot_url TEXT,
  recommendations JSONB DEFAULT '[]'::jsonb,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.cro_audits ENABLE ROW LEVEL SECURITY;

-- Public read access (app is publicly accessible)
CREATE POLICY "Anyone can view audits"
  ON public.cro_audits FOR SELECT
  USING (true);

-- Public insert access (audit generation is a public feature)
CREATE POLICY "Anyone can create audits"
  ON public.cro_audits FOR INSERT
  WITH CHECK (true);

-- Public update access (for updating status and recommendations)
CREATE POLICY "Anyone can update audits"
  ON public.cro_audits FOR UPDATE
  USING (true);

-- Trigger for updated_at
CREATE TRIGGER update_cro_audits_updated_at
  BEFORE UPDATE ON public.cro_audits
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create storage bucket for audit screenshots and mockups
INSERT INTO storage.buckets (id, name, public) VALUES ('audit-assets', 'audit-assets', true);

-- Public read access for audit assets
CREATE POLICY "Audit assets are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'audit-assets');

-- Public upload access for audit assets (edge functions upload)
CREATE POLICY "Anyone can upload audit assets"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'audit-assets');
