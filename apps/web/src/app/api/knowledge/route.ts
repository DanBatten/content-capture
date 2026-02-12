import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getAuthenticatedUser, unauthorizedResponse, hasScope } from '@/lib/api-auth';

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

interface TopicStat {
  topic_name: string;
  item_count: number;
  representative_image: string | null;
  latest_item_date: string | null;
}

/**
 * GET /api/knowledge
 * Returns topic statistics for the Knowledge page
 */
export async function GET(request: NextRequest) {
  // Require authentication
  const auth = await getAuthenticatedUser(request);
  if (!auth) return unauthorizedResponse();
  if (!hasScope(auth, 'read')) return unauthorizedResponse('Missing read scope');

  try {
    // Try to use the database function first
    const { data: stats, error: statsError } = await getSupabase().rpc('get_topic_stats', {
      p_user_id: auth.userId,
    });

    let topicStats: TopicStat[] = [];

    if (statsError) {
      // Fallback: compute stats manually if function doesn't exist
      console.warn('get_topic_stats function not available, computing manually');

      const { data: items, error: itemsError } = await getSupabase()
        .from('content_items')
        .select('topics, images, platform_data, created_at')
        .eq('status', 'complete')
        .eq('user_id', auth.userId);

      if (itemsError) {
        throw itemsError;
      }

      // Compute topic counts
      const topicMap = new Map<
        string,
        { count: number; image: string | null; latestDate: string | null }
      >();

      for (const item of items || []) {
        const topics = item.topics as string[] | null;
        if (!topics) continue;

        for (const topic of topics) {
          const existing = topicMap.get(topic) || { count: 0, image: null, latestDate: null };
          existing.count++;

          // Update image if we don't have one
          if (!existing.image) {
            const screenshot = (item.platform_data as Record<string, unknown>)?.screenshot as
              | string
              | undefined;
            const images = item.images as Array<{ publicUrl?: string; originalUrl?: string; url?: string }> | null;
            existing.image =
              screenshot || images?.[0]?.publicUrl || images?.[0]?.originalUrl || images?.[0]?.url || null;
          }

          // Update latest date
          const itemDate = item.created_at as string;
          if (!existing.latestDate || itemDate > existing.latestDate) {
            existing.latestDate = itemDate;
          }

          topicMap.set(topic, existing);
        }
      }

      // Convert to array and sort by count
      topicStats = Array.from(topicMap.entries())
        .map(([topic, data]) => ({
          topic_name: topic,
          item_count: data.count,
          representative_image: data.image,
          latest_item_date: data.latestDate,
        }))
        .sort((a, b) => b.item_count - a.item_count);
    } else {
      topicStats = stats || [];
    }

    // Get pinned topics from preferences
    const { data: prefs } = await getSupabase()
      .from('user_preferences')
      .select('pinned_topics')
      .eq('user_id', auth.userId)
      .single();

    const pinnedTopics = (prefs?.pinned_topics as string[]) || [];

    return NextResponse.json({
      topics: topicStats,
      pinnedTopics,
      totalTopics: topicStats.length,
    });
  } catch (error) {
    console.error('Knowledge API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch knowledge data' },
      { status: 500 }
    );
  }
}
