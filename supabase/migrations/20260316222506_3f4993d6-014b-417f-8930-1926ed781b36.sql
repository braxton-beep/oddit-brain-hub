ALTER TABLE public.recommendation_insights
  ADD COLUMN IF NOT EXISTS implemented_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS skipped_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS converted_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS effectiveness_score numeric NOT NULL DEFAULT 0;