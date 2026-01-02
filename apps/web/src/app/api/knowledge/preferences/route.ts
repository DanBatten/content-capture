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

/**
 * GET /api/knowledge/preferences
 * Returns user preferences for pinned topics
 */
export async function GET(request: NextRequest) {
  // Require authentication for external API calls
  const authError = requireAuth(request);
  if (authError) return authError;

  try {
    const { data, error } = await getSupabase()
      .from('user_preferences')
      .select('*')
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 is "no rows returned"
      throw error;
    }

    return NextResponse.json({
      pinnedTopics: data?.pinned_topics || [],
      customKnowledgeBases: data?.custom_knowledge_bases || [],
    });
  } catch (error) {
    console.error('Preferences GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch preferences' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/knowledge/preferences
 * Updates user preferences for pinned topics
 * Body: { pinnedTopics?: string[], customKnowledgeBases?: KnowledgeBase[] }
 */
export async function POST(request: NextRequest) {
  // Require authentication for external API calls
  const authError = requireAuth(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    const { pinnedTopics, customKnowledgeBases } = body;

    // Check if preferences exist
    const { data: existing } = await getSupabase()
      .from('user_preferences')
      .select('id')
      .limit(1)
      .single();

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (pinnedTopics !== undefined) {
      updates.pinned_topics = pinnedTopics;
    }

    if (customKnowledgeBases !== undefined) {
      updates.custom_knowledge_bases = customKnowledgeBases;
    }

    let result;
    if (existing) {
      // Update existing
      result = await getSupabase()
        .from('user_preferences')
        .update(updates)
        .eq('id', existing.id)
        .select()
        .single();
    } else {
      // Insert new
      result = await getSupabase()
        .from('user_preferences')
        .insert({
          ...updates,
          pinned_topics: pinnedTopics || [],
          custom_knowledge_bases: customKnowledgeBases || [],
        })
        .select()
        .single();
    }

    if (result.error) {
      throw result.error;
    }

    return NextResponse.json({
      pinnedTopics: result.data?.pinned_topics || [],
      customKnowledgeBases: result.data?.custom_knowledge_bases || [],
    });
  } catch (error) {
    console.error('Preferences POST error:', error);
    return NextResponse.json(
      { error: 'Failed to update preferences' },
      { status: 500 }
    );
  }
}
