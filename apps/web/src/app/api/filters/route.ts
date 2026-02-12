import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedUser, unauthorizedResponse, hasScope } from '@/lib/api-auth';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if (!auth) return unauthorizedResponse();

  if (!hasScope(auth, 'read')) {
    return NextResponse.json({ error: 'Insufficient scope. Required: read' }, { status: 403 });
  }

  try {
    const supabase = getSupabase();
    const { userId } = auth;

    const { data: items, error: itemsError } = await supabase
      .from('content_items')
      .select('source_type, topics, disciplines')
      .eq('user_id', userId)
      .eq('status', 'complete');

    const { data: notes, error: notesError } = await supabase
      .from('notes')
      .select('topics, disciplines')
      .eq('user_id', userId)
      .eq('status', 'complete');

    if (itemsError) {
      console.error('Database error:', itemsError);
      return NextResponse.json({ error: 'Failed to fetch filters' }, { status: 500 });
    }

    const sourceTypeCounts: Record<string, number> = {};
    const topicCounts: Record<string, number> = {};
    const disciplineCounts: Record<string, number> = {};

    for (const item of items || []) {
      if (item.source_type) {
        sourceTypeCounts[item.source_type] = (sourceTypeCounts[item.source_type] || 0) + 1;
      }
      if (item.topics && Array.isArray(item.topics)) {
        for (const topic of item.topics) {
          topicCounts[topic] = (topicCounts[topic] || 0) + 1;
        }
      }
      if (item.disciplines && Array.isArray(item.disciplines)) {
        for (const discipline of item.disciplines) {
          disciplineCounts[discipline] = (disciplineCounts[discipline] || 0) + 1;
        }
      }
    }

    const notesCount = notes?.length || 0;
    if (notesCount > 0) {
      sourceTypeCounts['note'] = notesCount;
      for (const note of notes || []) {
        if (note.topics && Array.isArray(note.topics)) {
          for (const topic of note.topics) {
            topicCounts[topic] = (topicCounts[topic] || 0) + 1;
          }
        }
        if (note.disciplines && Array.isArray(note.disciplines)) {
          for (const discipline of note.disciplines) {
            disciplineCounts[discipline] = (disciplineCounts[discipline] || 0) + 1;
          }
        }
      }
    }

    const sortByCount = (counts: Record<string, number>) =>
      Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .map(([name, count]) => ({ name, count }));

    return NextResponse.json({
      sourceTypes: sortByCount(sourceTypeCounts),
      topics: sortByCount(topicCounts),
      disciplines: sortByCount(disciplineCounts),
      totalItems: (items?.length || 0) + notesCount,
    });
  } catch (error) {
    console.error('Filters API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
