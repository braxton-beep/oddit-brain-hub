
-- Table for client brand assets (logos, product photos, lifestyle images, icons, etc.)
CREATE TABLE public.client_brand_assets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL DEFAULT '',
  file_url TEXT NOT NULL DEFAULT '',
  asset_type TEXT NOT NULL DEFAULT 'other',
  storage_path TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.client_brand_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view client_brand_assets" ON public.client_brand_assets FOR SELECT USING (true);
CREATE POLICY "Anyone can insert client_brand_assets" ON public.client_brand_assets FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update client_brand_assets" ON public.client_brand_assets FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete client_brand_assets" ON public.client_brand_assets FOR DELETE USING (true);

-- Trigger for updated_at
CREATE TRIGGER update_client_brand_assets_updated_at
BEFORE UPDATE ON public.client_brand_assets
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Storage bucket for brand assets
INSERT INTO storage.buckets (id, name, public) VALUES ('brand-assets', 'brand-assets', true);

CREATE POLICY "Anyone can view brand assets" ON storage.objects FOR SELECT USING (bucket_id = 'brand-assets');
CREATE POLICY "Anyone can upload brand assets" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'brand-assets');
CREATE POLICY "Anyone can delete brand assets" ON storage.objects FOR DELETE USING (bucket_id = 'brand-assets');
