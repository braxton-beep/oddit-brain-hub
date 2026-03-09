
CREATE TABLE public.lead_gen_opportunities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  platform TEXT NOT NULL DEFAULT 'x',
  post_id TEXT NOT NULL,
  post_url TEXT NOT NULL DEFAULT '',
  post_author TEXT NOT NULL DEFAULT '',
  post_text TEXT NOT NULL DEFAULT '',
  post_date TIMESTAMP WITH TIME ZONE,
  category TEXT NOT NULL DEFAULT 'other',
  relevance_score NUMERIC NOT NULL DEFAULT 0,
  draft_reply TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  slack_message_ts TEXT,
  replied_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(platform, post_id)
);

ALTER TABLE public.lead_gen_opportunities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view lead_gen_opportunities"
  ON public.lead_gen_opportunities FOR SELECT
  TO public USING (true);

CREATE POLICY "Anyone can insert lead_gen_opportunities"
  ON public.lead_gen_opportunities FOR INSERT
  TO public WITH CHECK (true);

CREATE POLICY "Anyone can update lead_gen_opportunities"
  ON public.lead_gen_opportunities FOR UPDATE
  TO public USING (true);

CREATE POLICY "Anyone can delete lead_gen_opportunities"
  ON public.lead_gen_opportunities FOR DELETE
  TO public USING (true);
