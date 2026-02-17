
-- Table to store integration API keys (team-wide, any authenticated user can manage)
CREATE TABLE public.integration_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id TEXT NOT NULL UNIQUE,
  api_key TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.integration_credentials ENABLE ROW LEVEL SECURITY;

-- Any authenticated team member can view credentials
CREATE POLICY "Authenticated users can view credentials"
  ON public.integration_credentials FOR SELECT
  TO authenticated USING (true);

-- Any authenticated team member can insert credentials
CREATE POLICY "Authenticated users can insert credentials"
  ON public.integration_credentials FOR INSERT
  TO authenticated WITH CHECK (true);

-- Any authenticated team member can update credentials
CREATE POLICY "Authenticated users can update credentials"
  ON public.integration_credentials FOR UPDATE
  TO authenticated USING (true);

-- Any authenticated team member can delete credentials
CREATE POLICY "Authenticated users can delete credentials"
  ON public.integration_credentials FOR DELETE
  TO authenticated USING (true);

-- Auto-update timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_integration_credentials_updated_at
  BEFORE UPDATE ON public.integration_credentials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
