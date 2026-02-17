
-- Projects table
CREATE TABLE public.projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  priority TEXT NOT NULL DEFAULT 'medium',
  owner TEXT NOT NULL DEFAULT '',
  progress INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view projects" ON public.projects FOR SELECT USING (true);
CREATE POLICY "Anyone can create projects" ON public.projects FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update projects" ON public.projects FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete projects" ON public.projects FOR DELETE USING (true);

CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Workflows table
CREATE TABLE public.workflows (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  steps INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'idle',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.workflows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view workflows" ON public.workflows FOR SELECT USING (true);
CREATE POLICY "Anyone can create workflows" ON public.workflows FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update workflows" ON public.workflows FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete workflows" ON public.workflows FOR DELETE USING (true);

CREATE TRIGGER update_workflows_updated_at
  BEFORE UPDATE ON public.workflows
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Knowledge sources table
CREATE TABLE public.knowledge_sources (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'FileText',
  item_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'synced',
  source_type TEXT NOT NULL DEFAULT 'manual',
  integration_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.knowledge_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view knowledge_sources" ON public.knowledge_sources FOR SELECT USING (true);
CREATE POLICY "Anyone can create knowledge_sources" ON public.knowledge_sources FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update knowledge_sources" ON public.knowledge_sources FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete knowledge_sources" ON public.knowledge_sources FOR DELETE USING (true);

CREATE TRIGGER update_knowledge_sources_updated_at
  BEFORE UPDATE ON public.knowledge_sources
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Activity log table
CREATE TABLE public.activity_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workflow_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view activity_log" ON public.activity_log FOR SELECT USING (true);
CREATE POLICY "Anyone can create activity_log" ON public.activity_log FOR INSERT WITH CHECK (true);

-- Seed initial knowledge sources
INSERT INTO public.knowledge_sources (name, icon, item_count, status, source_type) VALUES
  ('Meeting Notes', 'FileText', 142, 'synced', 'fireflies'),
  ('Client Calls', 'Phone', 87, 'synced', 'fireflies'),
  ('Sales KPIs', 'TrendingUp', 23, 'synced', 'manual'),
  ('Oddit Reports', 'FileText', 11000, 'synced', 'internal'),
  ('Slack Messages', 'MessageSquare', 3420, 'synced', 'slack'),
  ('CRO Playbooks', 'Database', 56, 'synced', 'manual');

-- Seed initial projects
INSERT INTO public.projects (name, description, status, priority, owner, progress) VALUES
  ('Braxley Bands', 'Full homepage redesign with CRO-optimized layout and hero section testing', 'in-progress', 'high', 'Braxton', 72),
  ('TechFlow', 'Product page optimization with enhanced social proof and checkout flow', 'in-progress', 'high', 'Ryan', 45),
  ('NovaPay', 'Checkout funnel optimization targeting cart abandonment reduction', 'active', 'medium', 'Taylor', 28),
  ('GreenLeaf Co', 'Landing page audit and mobile-first redesign strategy', 'up-next', 'medium', 'Shaun', 10);

-- Seed initial workflows
INSERT INTO public.workflows (name, description, steps, status) VALUES
  ('Full CRO Audit', 'End-to-end conversion rate optimization analysis for client stores', 8, 'active'),
  ('Weekly Report Gen', 'Auto-generate weekly performance reports for all active clients', 5, 'active'),
  ('Client Onboarding', 'Automated data collection and baseline analysis for new clients', 6, 'idle'),
  ('A/B Test Monitor', 'Track running experiments and alert on statistical significance', 4, 'running');

-- Seed some activity
INSERT INTO public.activity_log (workflow_name, status, created_at) VALUES
  ('Full CRO Audit — Braxley Bands', 'completed', now() - interval '2 minutes'),
  ('Weekly Report Gen — All Clients', 'completed', now() - interval '15 minutes'),
  ('A/B Test Monitor — TechFlow', 'running', now() - interval '32 minutes'),
  ('Client Onboarding — NovaPay', 'completed', now() - interval '1 hour'),
  ('Full CRO Audit — UrbanFit', 'failed', now() - interval '2 hours');
