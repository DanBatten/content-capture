import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { requireAuth } from '@/lib/api-auth';

// Lazy-initialized clients to avoid build-time errors
let supabase: SupabaseClient | null = null;
let anthropic: Anthropic | null = null;
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

function getAnthropic() {
  if (!anthropic) {
    anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY!,
    });
  }
  return anthropic;
}

function getOpenAI() {
  if (!openai) {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY!,
    });
  }
  return openai;
}


interface QueryRequest {
  query: string;
  limit?: number;
  threshold?: number;
  generateAnswer?: boolean;
  returnSources?: boolean;
  deepResearch?: boolean; // Enable comprehensive analysis mode
}

/**
 * External RAG API for tools like Claude Desktop, Cursor, etc.
 * POST /api/v1/query
 * Headers: Authorization: Bearer <EXTERNAL_API_KEY>
 * Body: { query: string, limit?: number, generateAnswer?: boolean, returnSources?: boolean }
 */
const DEEP_RESEARCH_SYSTEM = `You are conducting deep research across a personal knowledge base. Provide comprehensive analysis with:
1. Key insights and learnings synthesized across sources
2. Actionable takeaways the user can apply
3. Patterns, themes, and connections between sources
4. Gaps or areas for further exploration
Be thorough but focused. Structure your response clearly.`;

export async function POST(request: NextRequest) {
  // Require authentication for external API calls
  const authError = requireAuth(request);
  if (authError) return authError;

  try {
    const body: QueryRequest = await request.json();
    const {
      query,
      limit = 10,
      threshold = 0.3,
      generateAnswer = true,
      returnSources = true,
      deepResearch = false,
    } = body;

    if (!query || typeof query !== 'string') {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    // Configure based on mode
    const retrievalCount = deepResearch ? 20 : limit;
    const matchThreshold = deepResearch ? 0.25 : threshold;
    const maxTokens = deepResearch ? 4096 : 2048;
    const contentLimit = deepResearch ? 2000 : 1000;

    // 1. Generate embedding for the query
    const embeddingResponse = await getOpenAI().embeddings.create({
      model: 'text-embedding-3-small',
      input: query,
      dimensions: 1536,
    });

    const queryEmbedding = embeddingResponse.data[0].embedding;

    // 2. Semantic search
    const { data: results, error: searchError } = await getSupabase().rpc(
      'search_content_semantic',
      {
        query_embedding: `[${queryEmbedding.join(',')}]`,
        match_threshold: matchThreshold,
        match_count: retrievalCount,
      }
    );

    if (searchError) {
      console.error('Semantic search error:', searchError);
      return NextResponse.json({ error: 'Search failed' }, { status: 500 });
    }

    // 3. Optionally generate an answer using Claude
    let answer: string | null = null;

    if (generateAnswer && results && results.length > 0) {
      const context = results
        .map(
          (r: Record<string, unknown>) => {
            const bodyText = typeof r.body_text === 'string' ? r.body_text : '';
            return `Title: ${r.title || 'Untitled'}
Author: ${r.author_name || r.author_handle || 'Unknown'}
URL: ${r.source_url}
Topics: ${Array.isArray(r.topics) ? r.topics.join(', ') : 'N/A'}
Summary: ${r.summary || r.description || ''}
Content: ${bodyText.slice(0, contentLimit)}${bodyText.length > contentLimit ? '...' : ''}`;
          }
        )
        .join('\n\n---\n\n');

      const userPrompt = deepResearch
        ? `Conduct deep research on the following question using this knowledge base (${results.length} sources):

${context}

---

Research request: ${query}

Provide comprehensive analysis with key insights, actionable takeaways, patterns across sources, and areas for further exploration.`
        : `Based on the following content from a personal knowledge base (${results.length} sources), answer this question: "${query}"

Context:
${context}

Synthesize insights from these sources. Be specific and cite sources when relevant.`;

      const response = await getAnthropic().messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: maxTokens,
        system: deepResearch ? DEEP_RESEARCH_SYSTEM : undefined,
        messages: [
          {
            role: 'user',
            content: userPrompt,
          },
        ],
      });

      const textBlock = response.content.find((b) => b.type === 'text');
      answer = textBlock?.type === 'text' ? textBlock.text : null;
    }

    // 4. Format response
    const responseData: {
      query: string;
      answer?: string | null;
      sources?: Array<{
        id: string;
        title: string | null;
        url: string;
        author: string | null;
        summary: string | null;
        topics: string[];
        source_type: string;
      }>;
      total: number;
      mode: 'standard' | 'deep_research';
    } = {
      query,
      total: results?.length || 0,
      mode: deepResearch ? 'deep_research' : 'standard',
    };

    if (generateAnswer) {
      responseData.answer = answer;
    }

    if (returnSources) {
      responseData.sources = results?.map((r: Record<string, unknown>) => ({
        id: r.id as string,
        title: r.title as string | null,
        url: r.source_url as string,
        author: (r.author_name || r.author_handle) as string | null,
        summary: r.summary as string | null,
        topics: r.topics as string[],
        source_type: r.source_type as string,
      }));
    }

    return NextResponse.json(responseData);
  } catch (error) {
    console.error('Query API error:', error);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }
}

/**
 * GET endpoint for simple queries (useful for testing)
 */
export async function GET(request: NextRequest) {
  // Validate API key
  if (!validateApiKey(request)) {
    return NextResponse.json(
      { error: 'Unauthorized - invalid or missing API key' },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');
  const limit = parseInt(searchParams.get('limit') || '5');

  if (!query) {
    return NextResponse.json({ error: 'Query parameter q is required' }, { status: 400 });
  }

  // Forward to POST handler
  const mockRequest = new NextRequest(request.url, {
    method: 'POST',
    headers: request.headers,
    body: JSON.stringify({ query, limit, generateAnswer: true, returnSources: true }),
  });

  return POST(mockRequest);
}
