
-- Store Fireflies meeting transcripts
CREATE TABLE public.fireflies_transcripts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fireflies_id text NOT NULL UNIQUE,
  title text NOT NULL DEFAULT '',
  date timestamptz,
  duration real DEFAULT 0,
  organizer_email text,
  participants text[] DEFAULT '{}',
  summary text DEFAULT '',
  action_items text DEFAULT '',
  transcript_text text DEFAULT '',
  speaker_stats jsonb DEFAULT '[]',
  source_api_key_id uuid REFERENCES public.integration_credentials(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.fireflies_transcripts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view transcripts"
  ON public.fireflies_transcripts FOR SELECT USING (true);

CREATE POLICY "Anyone can insert transcripts"
  ON public.fireflies_transcripts FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update transcripts"
  ON public.fireflies_transcripts FOR UPDATE USING (true);

-- Index for fast lookups
CREATE INDEX idx_fireflies_transcripts_date ON public.fireflies_transcripts(date DESC);
CREATE INDEX idx_fireflies_transcripts_fireflies_id ON public.fireflies_transcripts(fireflies_id);

-- Trigger for updated_at
CREATE TRIGGER update_fireflies_transcripts_updated_at
  BEFORE UPDATE ON public.fireflies_transcripts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
