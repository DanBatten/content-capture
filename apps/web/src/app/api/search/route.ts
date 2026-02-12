import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { getAuthenticatedUser, unauthorizedResponse, hasScope, sanitizeFilterValue } from '@/lib/api-auth';

let supabase: ReturnType<typeof createClient> | null = null;
let anthropic: Anthropic | null = null;

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
    anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  }
  return anthropic;
}

interface SearchIntent {
  keywords: string[];
  topics: string[];
  useCases: string[];
  sourceTypes: string[];
  contentTypes: string[];
  searchStrategy: 'broad' | 'focused' | 'exact';
}

const SEARCH_SYSTEM_PROMPT = `You are a search intent analyzer for a content archive. The archive contains saved posts from Twitter/X, Instagram, LinkedIn, Pinterest, and web articles.

Each item in the archive has:
- title, description, body_text, summary (text fields)
- topics (array like: ["AI", "Design", "Marketing", "Technology", "Business", "Art", "Finance", etc.])
- use_cases (array like: ["Inspiration", "Reference", "Case Study", "Tutorial", "Tool", etc.])
- source_type: twitter, instagram, linkedin, pinterest, web
- content_type: post, article, thread, image, video

Given a natural language search query, extract search keywords that would appear in the DESCRIPTION or SUMMARY text of relevant items.

IMPORTANT:
- For keywords, think about what WORDS or PHRASES would literally appear in a description of matching content
- Include the exact terms from the query, plus synonyms and related terms that would appear in descriptions
- Include compound phrases that capture the full concept (e.g. "AI design" not just "AI" and "design" separately)
- Avoid overly generic single words like "tool", "best", "top" - focus on specific concepts
- Keep arrays concise (max 6-8 keywords/phrases)
- searchStrategy: "exact" for specific lookups, "focused" for topic-based, "broad" for exploratory

Respond with ONLY valid JSON, no markdown or explanation.`;

async function extractSearchIntent(query: string): Promise<SearchIntent> {
  try {
    const response = await getAnthropic().messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      system: SEARCH_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Search query: "${query}"

Extract the search intent as JSON with this structure:
{
  "keywords": ["word1", "word2"],
  "topics": ["Topic1", "Topic2"],
  "useCases": ["UseCase1"],
  "sourceTypes": [],
  "contentTypes": [],
  "searchStrategy": "focused"
}`,
        },
      ],
    });

    const textBlock = response.content.find((block) => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('No response from Claude');
    }

    let jsonStr = textBlock.text.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    return JSON.parse(jsonStr);
  } catch (error) {
    console.error('Failed to extract search intent:', error);
    return {
      keywords: query.split(' ').filter(w => w.length > 2),
      topics: [],
      useCases: [],
      sourceTypes: [],
      contentTypes: [],
      searchStrategy: 'broad',
    };
  }
}

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if (!auth) return unauthorizedResponse();

  if (!hasScope(auth, 'read')) {
    return NextResponse.json({ error: 'Insufficient scope. Required: read' }, { status: 403 });
  }

  try {
    const { query, page = 1, limit = 24 } = await request.json();
    const { userId } = auth;

    if (!query || typeof query !== 'string') {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    const offset = (page - 1) * limit;
    const intent = await extractSearchIntent(query);
    console.log('Search intent:', intent);

    // Build user-scoped search query
    let searchQuery = getSupabase()
      .from('content_items')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .eq('status', 'complete')
      .order('created_at', { ascending: false });

    // Sanitize keywords before constructing .or() filter
    const orConditions: string[] = [];
    if (intent.keywords.length > 0) {
      for (const keyword of intent.keywords) {
        const safe = sanitizeFilterValue(keyword);
        if (!safe) continue;
        orConditions.push(`description.ilike.%${safe}%`);
        orConditions.push(`summary.ilike.%${safe}%`);
        orConditions.push(`title.ilike.%${safe}%`);
        orConditions.push(`body_text.ilike.%${safe}%`);
      }
    }

    if (orConditions.length > 0) {
      searchQuery = searchQuery.or(orConditions.join(','));
    }

    if (intent.sourceTypes.length === 1) {
      searchQuery = searchQuery.eq('source_type', intent.sourceTypes[0]);
    } else if (intent.sourceTypes.length > 1) {
      searchQuery = searchQuery.in('source_type', intent.sourceTypes);
    }

    if (intent.contentTypes.length === 1) {
      searchQuery = searchQuery.eq('content_type', intent.contentTypes[0]);
    } else if (intent.contentTypes.length > 1) {
      searchQuery = searchQuery.in('content_type', intent.contentTypes);
    }

    searchQuery = searchQuery.range(offset, offset + limit - 1);

    const { data: textResults, error: textError, count: textCount } = await searchQuery;

    if (textError) {
      console.error('Text search error:', textError);
    }

    const resultMap = new Map();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((textResults || []) as any[]).forEach((item, index) => {
      let score = 100 - index;
      const lowerKeywords = intent.keywords.map(k => k.toLowerCase());

      for (const keyword of lowerKeywords) {
        if (item.title?.toLowerCase().includes(keyword)) score += 25;
        if (item.description?.toLowerCase().includes(keyword)) score += 15;
        if (item.summary?.toLowerCase().includes(keyword)) score += 10;
      }

      if (intent.topics.length > 0 && item.topics) {
        const matchingTopics = intent.topics.filter(t =>
          item.topics.some((it: string) => it.toLowerCase() === t.toLowerCase())
        );
        score += matchingTopics.length * 5;
      }

      resultMap.set(item.id, { ...item, _score: score });
    });

    const allResults = Array.from(resultMap.values())
      .sort((a, b) => b._score - a._score)
      .map(({ _score, ...item }) => item);

    const paginatedResults = allResults.slice(0, limit);
    const totalResults = allResults.length;

    return NextResponse.json({
      items: paginatedResults,
      total: Math.max(textCount || 0, totalResults),
      page,
      limit,
      totalPages: Math.ceil(Math.max(textCount || 0, totalResults) / limit),
      intent,
    });
  } catch (error) {
    console.error('Search API error:', error);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if (!auth) return unauthorizedResponse();

  if (!hasScope(auth, 'read')) {
    return NextResponse.json({ error: 'Insufficient scope. Required: read' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '24');

  if (!query) {
    return NextResponse.json({ error: 'Query parameter q is required' }, { status: 400 });
  }

  const offset = (page - 1) * limit;
  const safe = sanitizeFilterValue(query);

  const { data, error, count } = await getSupabase()
    .from('content_items')
    .select('*', { count: 'exact' })
    .eq('user_id', auth.userId)
    .eq('status', 'complete')
    .or(`title.ilike.%${safe}%,description.ilike.%${safe}%,summary.ilike.%${safe}%,body_text.ilike.%${safe}%`)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error('Search error:', error);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }

  return NextResponse.json({
    items: data || [],
    total: count || 0,
    page,
    limit,
    totalPages: Math.ceil((count || 0) / limit),
  });
}
