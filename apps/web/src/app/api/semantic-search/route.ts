import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

/**
 * Semantic search API using vector embeddings
 * POST /api/semantic-search
 * Body: { query: string, limit?: number, threshold?: number }
 */
export async function POST(request: NextRequest) {
  try {
    const { query, limit = 10, threshold = 0.5 } = await request.json();

    if (!query || typeof query !== 'string') {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    // Generate embedding for the query
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: query,
      dimensions: 1536,
    });

    const queryEmbedding = embeddingResponse.data[0].embedding;

    // Search using pgvector
    const { data, error } = await supabase.rpc('search_content_semantic', {
      query_embedding: `[${queryEmbedding.join(',')}]`,
      match_threshold: threshold,
      match_count: limit,
    });

    if (error) {
      console.error('Semantic search error:', error);
      return NextResponse.json({ error: 'Search failed' }, { status: 500 });
    }

    return NextResponse.json({
      items: data || [],
      query,
      total: data?.length || 0,
    });
  } catch (error) {
    console.error('Semantic search API error:', error);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
