import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { requireAuth } from '@/lib/api-auth';

let supabase: SupabaseClient | null = null;

function getSupabase() {
  if (!supabase) {
    supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }
  return supabase;
}

interface TopicParams {
  params: Promise<{ topic: string }>;
}

/**
 * GET /api/knowledge/[topic]
 * Returns details and items for a specific topic
 */
export async function GET(request: NextRequest, { params }: TopicParams) {
  // Require authentication for external API calls
  const authError = requireAuth(request);
  if (authError) return authError;

  try {
    const { topic } = await params;
    const decodedTopic = decodeURIComponent(topic);

    // Get items for this topic
    const { data: items, error: itemsError } = await getSupabase()
      .from('content_items')
      .select(
        'id, source_url, source_type, title, description, summary, body_text, author_name, author_handle, topics, images, platform_data, created_at'
      )
      .contains('topics', [decodedTopic])
      .eq('status', 'complete')
      .order('created_at', { ascending: false })
      .limit(50);

    if (itemsError) {
      throw itemsError;
    }

    // Get cached overview if available
    const { data: overview } = await getSupabase()
      .from('topic_overviews')
      .select('*')
      .eq('topic_name', decodedTopic)
      .single();

    // Calculate topic stats
    const itemCount = items?.length || 0;
    const sourceTypes = new Map<string, number>();
    const relatedTopics = new Map<string, number>();

    for (const item of items || []) {
      // Count source types
      const st = item.source_type as string;
      sourceTypes.set(st, (sourceTypes.get(st) || 0) + 1);

      // Count related topics
      const topics = item.topics as string[] | null;
      if (topics) {
        for (const t of topics) {
          if (t !== decodedTopic) {
            relatedTopics.set(t, (relatedTopics.get(t) || 0) + 1);
          }
        }
      }
    }

    // Sort related topics by count
    const sortedRelatedTopics = Array.from(relatedTopics.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }));

    return NextResponse.json({
      topic: decodedTopic,
      itemCount,
      items,
      overview: overview
        ? {
            text: overview.overview_text,
            suggestedPrompts: overview.suggested_prompts,
            generatedAt: overview.generated_at,
          }
        : null,
      sourceTypes: Object.fromEntries(sourceTypes),
      relatedTopics: sortedRelatedTopics,
    });
  } catch (error) {
    console.error('Topic API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch topic data' },
      { status: 500 }
    );
  }
}
