CREATE OR REPLACE FUNCTION public.search_transcripts_semantic(
  query_embedding vector(512),
  match_count int DEFAULT 15,
  similarity_threshold float DEFAULT 0.3
)
RETURNS TABLE (
  id uuid,
  title text,
  date timestamptz,
  summary text,
  action_items text,
  organizer_email text,
  participants text[],
  duration real,
  transcript_text text,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    ft.id,
    ft.title,
    ft.date,
    ft.summary,
    ft.action_items,
    ft.organizer_email,
    ft.participants,
    ft.duration,
    ft.transcript_text,
    1 - (ft.embedding <=> query_embedding) AS similarity
  FROM fireflies_transcripts ft
  WHERE ft.embedding IS NOT NULL
    AND 1 - (ft.embedding <=> query_embedding) > similarity_threshold
  ORDER BY ft.embedding <=> query_embedding
  LIMIT match_count;
$$;