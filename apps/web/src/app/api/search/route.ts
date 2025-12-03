import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

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
    const response = await anthropic.messages.create({
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
    // Fallback: use query as-is
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
  try {
    const { query, page = 1, limit = 24 } = await request.json();

    if (!query || typeof query !== 'string') {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    const offset = (page - 1) * limit;

    // Extract search intent using Claude
    const intent = await extractSearchIntent(query);
    console.log('Search intent:', intent);

    // Build dynamic search query
    let searchQuery = supabase
      .from('content_items')
      .select('*', { count: 'exact' })
      .eq('status', 'complete')
      .order('created_at', { ascending: false });

    // Build OR conditions for text-based search
    // Focus on description/summary as they contain the AI-analyzed content
    const orConditions: string[] = [];

    if (intent.keywords.length > 0) {
      for (const keyword of intent.keywords) {
        // Prioritize description and summary (AI-generated, more semantic)
        orConditions.push(`description.ilike.%${keyword}%`);
        orConditions.push(`summary.ilike.%${keyword}%`);
        // Also search title and body for direct matches
        orConditions.push(`title.ilike.%${keyword}%`);
        orConditions.push(`body_text.ilike.%${keyword}%`);
      }
    }

    // Apply OR conditions if we have any
    if (orConditions.length > 0) {
      searchQuery = searchQuery.or(orConditions.join(','));
    }

    // Filter by source type if specified
    if (intent.sourceTypes.length === 1) {
      searchQuery = searchQuery.eq('source_type', intent.sourceTypes[0]);
    } else if (intent.sourceTypes.length > 1) {
      searchQuery = searchQuery.in('source_type', intent.sourceTypes);
    }

    // Filter by content type if specified
    if (intent.contentTypes.length === 1) {
      searchQuery = searchQuery.eq('content_type', intent.contentTypes[0]);
    } else if (intent.contentTypes.length > 1) {
      searchQuery = searchQuery.in('content_type', intent.contentTypes);
    }

    // Apply pagination
    searchQuery = searchQuery.range(offset, offset + limit - 1);

    const { data: textResults, error: textError, count: textCount } = await searchQuery;

    if (textError) {
      console.error('Text search error:', textError);
    }

    // Score and rank results based on where matches occurred
    // Text results are the primary source - no longer pulling in tag-only matches
    const resultMap = new Map();
    
    // Add text results and calculate relevance score
    (textResults || []).forEach((item, index) => {
      let score = 100 - index; // Base score by position
      
      // Boost items that match in more specific fields
      const lowerKeywords = intent.keywords.map(k => k.toLowerCase());
      
      for (const keyword of lowerKeywords) {
        // Higher boost for title matches (most specific)
        if (item.title?.toLowerCase().includes(keyword)) {
          score += 25;
        }
        // Good boost for description matches (AI-analyzed content)
        if (item.description?.toLowerCase().includes(keyword)) {
          score += 15;
        }
        // Moderate boost for summary matches
        if (item.summary?.toLowerCase().includes(keyword)) {
          score += 10;
        }
      }
      
      // Small boost if topics align (but don't add new items based on this)
      if (intent.topics.length > 0 && item.topics) {
        const matchingTopics = intent.topics.filter(t => 
          item.topics.some((it: string) => it.toLowerCase() === t.toLowerCase())
        );
        score += matchingTopics.length * 5;
      }
      
      resultMap.set(item.id, { ...item, _score: score });
    });

    // Sort by score and paginate
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
      intent, // Return the extracted intent for debugging/transparency
    });
  } catch (error) {
    console.error('Search API error:', error);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}

// Also support GET for simple searches (fallback to basic search)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '24');

  if (!query) {
    return NextResponse.json({ error: 'Query parameter q is required' }, { status: 400 });
  }

  // For GET requests, do a simpler search without Claude
  const offset = (page - 1) * limit;

  const { data, error, count } = await supabase
    .from('content_items')
    .select('*', { count: 'exact' })
    .eq('status', 'complete')
    .or(`title.ilike.%${query}%,description.ilike.%${query}%,summary.ilike.%${query}%,body_text.ilike.%${query}%`)
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

