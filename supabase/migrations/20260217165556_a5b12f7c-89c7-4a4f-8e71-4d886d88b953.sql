
-- Add unique constraint on integration_id for knowledge_sources upsert
CREATE UNIQUE INDEX IF NOT EXISTS knowledge_sources_integration_id_key
  ON public.knowledge_sources(integration_id)
  WHERE integration_id IS NOT NULL;
