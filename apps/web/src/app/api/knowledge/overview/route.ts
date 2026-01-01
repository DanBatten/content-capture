import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

let supabase: SupabaseClient | null = null;
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
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is not set');
    }
    anthropic = new Anthropic({ apiKey });
  }
  return anthropic;
}

const OVERVIEW_SYSTEM_PROMPT = `You are summarizing a user's knowledge base on a specific topic.

Given a sample of content items on a topic, generate:
1. A 2-3 paragraph overview of what the user has collected on this topic
2. Key themes or patterns you notice across the content
3. 4-5 suggested questions or prompts for exploring this topic further

Be specific and reference actual content when relevant. Don't be generic - make the overview feel personalized to what they've actually saved.

Format your response as JSON:
{
  "overview": "2-3 paragraph overview text",
  "suggestedPrompts": ["Question 1?", "Question 2?", "Question 3?", "Question 4?"]
}`;

/**
 * POST /api/knowledge/overview
 * Generates an AI overview for a topic
 * Body: { topic: string, forceRefresh?: boolean }
 */
export async function POST(request: NextRequest) {
  try {
    const { topic, forceRefresh = false } = await request.json();

    if (!topic || typeof topic !== 'string') {
      return NextResponse.json({ error: 'Topic is required' }, { status: 400 });
    }

    // Check cache first (unless forceRefresh)
    if (!forceRefresh) {
      const { data: cached } = await getSupabase()
        .from('topic_overviews')
        .select('*')
        .eq('topic_name', topic)
        .single();

      if (cached && cached.generated_at) {
        // Check if cache is recent (less than 24 hours old)
        const cacheAge = Date.now() - new Date(cached.generated_at).getTime();
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours

        if (cacheAge < maxAge) {
          return NextResponse.json({
            overview: cached.overview_text,
            suggestedPrompts: cached.suggested_prompts,
            generatedAt: cached.generated_at,
            cached: true,
          });
        }
      }
    }

    // Fetch sample items for this topic
    const { data: items, error: itemsError } = await getSupabase()
      .from('content_items')
      .select('title, summary, body_text, author_name, source_type, topics')
      .contains('topics', [topic])
      .eq('status', 'complete')
      .order('created_at', { ascending: false })
      .limit(15);

    if (itemsError) {
      throw itemsError;
    }

    if (!items || items.length === 0) {
      return NextResponse.json({
        overview: `You don't have any content saved about ${topic} yet.`,
        suggestedPrompts: [
          `What would you like to learn about ${topic}?`,
          `Save some articles or posts about ${topic} to build your knowledge base.`,
        ],
        generatedAt: new Date().toISOString(),
        cached: false,
      });
    }

    // Format items for Claude
    const contentSummary = items
      .map((item, i) => {
        const summary = item.summary || item.body_text?.slice(0, 500) || '';
        return `${i + 1}. "${item.title || 'Untitled'}" by ${item.author_name || 'Unknown'} (${item.source_type})
Topics: ${(item.topics as string[])?.join(', ') || 'N/A'}
${summary}`;
      })
      .join('\n\n');

    // Generate overview with Claude
    const response = await getAnthropic().messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: OVERVIEW_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Generate an overview for my knowledge base on "${topic}". Here are ${items.length} items I've saved:

${contentSummary}`,
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === 'text');
    const responseText = textBlock?.type === 'text' ? textBlock.text : '';

    // Parse JSON response
    let overview = '';
    let suggestedPrompts: string[] = [];

    try {
      // Try to extract JSON from the response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        overview = parsed.overview || '';
        suggestedPrompts = parsed.suggestedPrompts || [];
      } else {
        // Fallback: use raw text as overview
        overview = responseText;
        suggestedPrompts = [
          `What are the key insights about ${topic}?`,
          `How can I apply what I've learned about ${topic}?`,
          `What patterns do you see in my ${topic} content?`,
        ];
      }
    } catch {
      overview = responseText;
      suggestedPrompts = [
        `What are the key insights about ${topic}?`,
        `How can I apply what I've learned about ${topic}?`,
      ];
    }

    const generatedAt = new Date().toISOString();

    // Cache the result
    const { error: upsertError } = await getSupabase()
      .from('topic_overviews')
      .upsert(
        {
          topic_name: topic,
          overview_text: overview,
          suggested_prompts: suggestedPrompts,
          item_count: items.length,
          generated_at: generatedAt,
          updated_at: generatedAt,
        },
        { onConflict: 'topic_name' }
      );

    if (upsertError) {
      console.warn('Failed to cache overview:', upsertError);
    }

    return NextResponse.json({
      overview,
      suggestedPrompts,
      generatedAt,
      cached: false,
    });
  } catch (error) {
    console.error('Overview generation error:', error);
    const message = error instanceof Error ? error.message : 'Failed to generate overview';
    const isConfigError = message.includes('environment variable');
    return NextResponse.json(
      { error: isConfigError ? 'AI service is not configured' : 'Failed to generate overview' },
      { status: isConfigError ? 503 : 500 }
    );
  }
}
