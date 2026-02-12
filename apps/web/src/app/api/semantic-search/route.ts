import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { getAuthenticatedUser, unauthorizedResponse, hasScope } from '@/lib/api-auth';

let supabase: SupabaseClient | null = null;
let openai: OpenAI | null = null;

function getSupabase() {
  if (!supabase) {
    supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }
  return supabase;
}

function getOpenAI() {
  if (!openai) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  }
  return openai;
}

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if (!auth) return unauthorizedResponse();

  if (!hasScope(auth, 'read')) {
    return NextResponse.json({ error: 'Insufficient scope. Required: read' }, { status: 403 });
  }

  try {
    const { query, limit = 10, threshold = 0.3 } = await request.json();

    if (!query || typeof query !== 'string') {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    const embeddingResponse = await getOpenAI().embeddings.create({
      model: 'text-embedding-3-small',
      input: query,
      dimensions: 1536,
    });

    const queryEmbedding = embeddingResponse.data[0].embedding;

    const { data, error } = await getSupabase().rpc('search_content_semantic', {
      query_embedding: `[${queryEmbedding.join(',')}]`,
      match_threshold: threshold,
      match_count: limit,
      p_user_id: auth.userId,
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
