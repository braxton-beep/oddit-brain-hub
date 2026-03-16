-- Clear existing embeddings (wrong dimension) and alter column to vector(512)
UPDATE public.fireflies_transcripts SET embedding = NULL, embedding_updated_at = NULL WHERE embedding IS NOT NULL;
ALTER TABLE public.fireflies_transcripts ALTER COLUMN embedding TYPE vector(512) USING embedding::vector(512);