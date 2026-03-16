import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

const BATCH_SIZE = 20

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const { data: transcripts, error: fetchError } = await supabase
    .from('fireflies_transcripts')
    .select('id, title, summary, transcript_text, organizer_email')
    .is('embedding', null)
    .limit(BATCH_SIZE)

  if (fetchError) {
    return new Response(JSON.stringify({ error: fetchError.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  if (!transcripts?.length) {
    return new Response(JSON.stringify({ message: 'All transcripts embedded ✓', processed: 0 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  const VOYAGE_API_KEY = Deno.env.get('VOYAGE_API_KEY')
  if (!VOYAGE_API_KEY) {
    return new Response(JSON.stringify({ error: 'VOYAGE_API_KEY not configured' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  // Build texts for batch embedding
  const texts: string[] = []
  const validTranscripts: typeof transcripts = []

  for (const t of transcripts) {
    const text = [
      t.title ? `Title: ${t.title}` : null,
      t.organizer_email ? `Client/Organizer: ${t.organizer_email}` : null,
      t.summary ? `Summary: ${t.summary}` : null,
      t.transcript_text ? `Transcript excerpt: ${t.transcript_text.slice(0, 4000)}` : null,
    ].filter(Boolean).join('\n\n')

    if (text.trim()) {
      texts.push(text)
      validTranscripts.push(t)
    }
  }

  if (!texts.length) {
    return new Response(JSON.stringify({ message: 'No valid text to embed', processed: 0 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  console.log(`Sending ${texts.length} texts to Voyage API in single batch...`)

  // Single batch API call
  const embeddingRes = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({ model: 'voyage-3-lite', input: texts }),
  })

  if (!embeddingRes.ok) {
    const errText = await embeddingRes.text()
    console.error(`Voyage API error ${embeddingRes.status}: ${errText}`)
    return new Response(JSON.stringify({ error: `Voyage API ${embeddingRes.status}: ${errText}` }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  const embeddingData = await embeddingRes.json()
  const embeddings = embeddingData?.data

  console.log(`Got ${embeddings?.length ?? 0} embeddings back`)

  const results = { processed: 0, failed: 0, errors: [] as string[] }

  for (let i = 0; i < validTranscripts.length; i++) {
    const embedding = embeddings?.[i]?.embedding
    if (!embedding?.length) { results.failed++; continue }

    const { error: updateError } = await supabase
      .from('fireflies_transcripts')
      .update({ embedding, embedding_updated_at: new Date().toISOString() })
      .eq('id', validTranscripts[i].id)

    if (updateError) {
      results.errors.push(`Update ${validTranscripts[i].id}: ${updateError.message}`)
      results.failed++
    } else {
      results.processed++
    }
  }

  const { count: remaining } = await supabase
    .from('fireflies_transcripts')
    .select('id', { count: 'exact', head: true })
    .is('embedding', null)

  console.log(`Done: processed=${results.processed}, failed=${results.failed}, remaining=${remaining}`)

  return new Response(
    JSON.stringify({ ...results, remaining_after_this_run: remaining ?? 'unknown' }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
