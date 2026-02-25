
-- Shopify connections table
CREATE TABLE public.shopify_connections (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  shop_domain text NOT NULL,
  access_token text NOT NULL,
  scopes text NOT NULL DEFAULT '',
  theme_id text,
  connected_at timestamp with time zone NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'connected',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.shopify_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view shopify_connections" ON public.shopify_connections FOR SELECT USING (true);
CREATE POLICY "Anyone can insert shopify_connections" ON public.shopify_connections FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update shopify_connections" ON public.shopify_connections FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete shopify_connections" ON public.shopify_connections FOR DELETE USING (true);

-- Shopify theme files table
CREATE TABLE public.shopify_theme_files (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  connection_id uuid NOT NULL REFERENCES public.shopify_connections(id) ON DELETE CASCADE,
  filename text NOT NULL,
  content text NOT NULL DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.shopify_theme_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view shopify_theme_files" ON public.shopify_theme_files FOR SELECT USING (true);
CREATE POLICY "Anyone can insert shopify_theme_files" ON public.shopify_theme_files FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update shopify_theme_files" ON public.shopify_theme_files FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete shopify_theme_files" ON public.shopify_theme_files FOR DELETE USING (true);

CREATE TRIGGER update_shopify_connections_updated_at
  BEFORE UPDATE ON public.shopify_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_shopify_theme_files_updated_at
  BEFORE UPDATE ON public.shopify_theme_files
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
