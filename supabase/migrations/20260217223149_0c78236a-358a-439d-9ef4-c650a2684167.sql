
-- Create competitive_intel table
CREATE TABLE public.competitive_intel (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_name TEXT NOT NULL DEFAULT '',
  competitor_url TEXT NOT NULL DEFAULT '',
  findings JSONB NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.competitive_intel ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Anyone can view competitive_intel"
  ON public.competitive_intel FOR SELECT USING (true);

CREATE POLICY "Anyone can insert competitive_intel"
  ON public.competitive_intel FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update competitive_intel"
  ON public.competitive_intel FOR UPDATE USING (true);

CREATE POLICY "Anyone can delete competitive_intel"
  ON public.competitive_intel FOR DELETE USING (true);

-- Updated_at trigger
CREATE TRIGGER update_competitive_intel_updated_at
  BEFORE UPDATE ON public.competitive_intel
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
