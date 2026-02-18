
CREATE TABLE public.clients (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  shopify_url text NOT NULL DEFAULT '',
  industry text NOT NULL DEFAULT 'Other',
  vertical text NOT NULL DEFAULT '',
  revenue_tier text NOT NULL DEFAULT '',
  project_status text NOT NULL DEFAULT 'Active',
  contact_name text NOT NULL DEFAULT '',
  contact_email text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  tags text[] NOT NULL DEFAULT '{}',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view clients"
  ON public.clients FOR SELECT USING (true);

CREATE POLICY "Anyone can insert clients"
  ON public.clients FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update clients"
  ON public.clients FOR UPDATE USING (true);

CREATE POLICY "Anyone can delete clients"
  ON public.clients FOR DELETE USING (true);

CREATE TRIGGER update_clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
