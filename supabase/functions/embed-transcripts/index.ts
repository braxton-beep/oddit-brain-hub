import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

const BATCH_SIZE = 10
const DELAY_MS = 250
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

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

  const results = { processed: 0, failed: 0, errors: [] as string[] }

  for (const transcript of transcripts) {
    try {
      const textToEmbed = [
        transcript.title ? `Title: ${transcript.title}` : null,
        transcript.organizer_email ? `Client/Organizer: ${transcript.organizer_email}` : null,
        transcript.summary ? `Summary: ${transcript.summary}` : null,
        transcript.transcript_text ? `Transcript excerpt: ${transcript.transcript_text.slice(0, 4000)}` : null,
      ].filter(Boolean).join('\n\n')

      if (!textToEmbed.trim()) { results.failed++; continue }

      const embeddingRes = await fetch('https://api.voyageai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${VOYAGE_API_KEY}`,
        },
        body: JSON.stringify({ model: 'voyage-3-lite', input: textToEmbed }),
      })

      if (!embeddingRes.ok) {
        results.errors.push(`${transcript.id}: ${await embeddingRes.text()}`)
        results.failed++; continue
      }

      const embedding = (await embeddingRes.json())?.data?.[0]?.embedding
      if (!embedding?.length) { results.failed++; continue }

      const { error: updateError } = await supabase
        .from('fireflies_transcripts')
        .update({ embedding, embedding_updated_at: new Date().toISOString() })
        .eq('id', transcript.id)

      if (updateError) { results.errors.push(`Update failed ${transcript.id}: ${updateError.message}`); results.failed++ }
      else results.processed++

      // Rate limit: small delay between requests
      await sleep(DELAY_MS)

    } catch (err) {
      results.errors.push(`Exception ${transcript.id}: ${(err as Error).message}`)
      results.failed++
    }
  }

  const { count: remaining } = await supabase
    .from('fireflies_transcripts')
    .select('id', { count: 'exact', head: true })
    .is('embedding', null)

  return new Response(
    JSON.stringify({ ...results, remaining_after_this_run: remaining ?? 'unknown' }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
