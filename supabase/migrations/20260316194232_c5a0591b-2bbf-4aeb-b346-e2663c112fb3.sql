create extension if not exists vector;
alter table fireflies_transcripts add column if not exists embedding vector(1536), add column if not exists embedding_updated_at timestamptz;