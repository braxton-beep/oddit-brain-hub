
-- ── Oddit Scores ──────────────────────────────────────
CREATE TABLE public.oddit_scores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_name TEXT NOT NULL DEFAULT '',
  shop_url TEXT NOT NULL DEFAULT '',
  cro_audit_id UUID NULL REFERENCES public.cro_audits(id) ON DELETE SET NULL,
  clarity_value_prop NUMERIC(5,1) NOT NULL DEFAULT 0,
  visual_hierarchy NUMERIC(5,1) NOT NULL DEFAULT 0,
  trust_signals NUMERIC(5,1) NOT NULL DEFAULT 0,
  mobile_ux NUMERIC(5,1) NOT NULL DEFAULT 0,
  funnel_logic NUMERIC(5,1) NOT NULL DEFAULT 0,
  copy_strength NUMERIC(5,1) NOT NULL DEFAULT 0,
  social_proof NUMERIC(5,1) NOT NULL DEFAULT 0,
  speed_perception NUMERIC(5,1) NOT NULL DEFAULT 0,
  total_score NUMERIC(5,1) NOT NULL DEFAULT 0,
  dimension_notes JSONB NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.oddit_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view oddit_scores" ON public.oddit_scores FOR SELECT USING (true);
CREATE POLICY "Anyone can insert oddit_scores" ON public.oddit_scores FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update oddit_scores" ON public.oddit_scores FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete oddit_scores" ON public.oddit_scores FOR DELETE USING (true);

CREATE TRIGGER update_oddit_scores_updated_at
  BEFORE UPDATE ON public.oddit_scores
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── Recommendation Insights ───────────────────────────
CREATE TABLE public.recommendation_insights (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recommendation_text TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  frequency_count INTEGER NOT NULL DEFAULT 1,
  client_examples JSONB NULL DEFAULT '[]',
  template_content TEXT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.recommendation_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view recommendation_insights" ON public.recommendation_insights FOR SELECT USING (true);
CREATE POLICY "Anyone can insert recommendation_insights" ON public.recommendation_insights FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update recommendation_insights" ON public.recommendation_insights FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete recommendation_insights" ON public.recommendation_insights FOR DELETE USING (true);

CREATE TRIGGER update_recommendation_insights_updated_at
  BEFORE UPDATE ON public.recommendation_insights
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── Report Drafts ─────────────────────────────────────
CREATE TABLE public.report_drafts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_name TEXT NOT NULL DEFAULT '',
  transcript_id TEXT NULL,
  fireflies_id TEXT NULL,
  sections JSONB NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'in-progress',
  progress INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.report_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view report_drafts" ON public.report_drafts FOR SELECT USING (true);
CREATE POLICY "Anyone can insert report_drafts" ON public.report_drafts FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update report_drafts" ON public.report_drafts FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete report_drafts" ON public.report_drafts FOR DELETE USING (true);

CREATE TRIGGER update_report_drafts_updated_at
  BEFORE UPDATE ON public.report_drafts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── Client Portal ─────────────────────────────────────
ALTER TABLE public.cro_audits ADD COLUMN IF NOT EXISTS portal_token TEXT NULL;
ALTER TABLE public.cro_audits ADD COLUMN IF NOT EXISTS portal_enabled BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE public.client_implementations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  audit_id UUID NOT NULL REFERENCES public.cro_audits(id) ON DELETE CASCADE,
  recommendation_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  notes TEXT NULL DEFAULT '',
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.client_implementations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view client_implementations" ON public.client_implementations FOR SELECT USING (true);
CREATE POLICY "Anyone can insert client_implementations" ON public.client_implementations FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update client_implementations" ON public.client_implementations FOR UPDATE USING (true);

-- ── KPI Benchmarks ────────────────────────────────────
CREATE TABLE public.kpi_benchmarks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  industry TEXT NOT NULL DEFAULT '',
  revenue_tier TEXT NOT NULL DEFAULT '',
  metric_name TEXT NOT NULL DEFAULT '',
  p25 NUMERIC(12,4) NULL,
  p50 NUMERIC(12,4) NULL,
  p75 NUMERIC(12,4) NULL,
  unit TEXT NOT NULL DEFAULT '%',
  source_count INTEGER NOT NULL DEFAULT 1,
  source_transcript_ids JSONB NULL DEFAULT '[]',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.kpi_benchmarks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view kpi_benchmarks" ON public.kpi_benchmarks FOR SELECT USING (true);
CREATE POLICY "Anyone can insert kpi_benchmarks" ON public.kpi_benchmarks FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update kpi_benchmarks" ON public.kpi_benchmarks FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete kpi_benchmarks" ON public.kpi_benchmarks FOR DELETE USING (true);

CREATE TRIGGER update_kpi_benchmarks_updated_at
  BEFORE UPDATE ON public.kpi_benchmarks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
