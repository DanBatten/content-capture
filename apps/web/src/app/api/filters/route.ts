import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  try {
    // Get all completed items to extract filter options
    const { data: items, error } = await supabase
      .from('content_items')
      .select('source_type, topics, disciplines')
      .eq('status', 'complete');

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json({ error: 'Failed to fetch filters' }, { status: 500 });
    }

    // Extract unique source types with counts
    const sourceTypeCounts: Record<string, number> = {};
    const topicCounts: Record<string, number> = {};
    const disciplineCounts: Record<string, number> = {};

    for (const item of items || []) {
      // Source types
      if (item.source_type) {
        sourceTypeCounts[item.source_type] = (sourceTypeCounts[item.source_type] || 0) + 1;
      }

      // Topics
      if (item.topics && Array.isArray(item.topics)) {
        for (const topic of item.topics) {
          topicCounts[topic] = (topicCounts[topic] || 0) + 1;
        }
      }

      // Disciplines
      if (item.disciplines && Array.isArray(item.disciplines)) {
        for (const discipline of item.disciplines) {
          disciplineCounts[discipline] = (disciplineCounts[discipline] || 0) + 1;
        }
      }
    }

    // Sort by count and convert to arrays
    const sortByCount = (counts: Record<string, number>) =>
      Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .map(([name, count]) => ({ name, count }));

    return NextResponse.json({
      sourceTypes: sortByCount(sourceTypeCounts),
      topics: sortByCount(topicCounts),
      disciplines: sortByCount(disciplineCounts),
      totalItems: items?.length || 0,
    });
  } catch (error) {
    console.error('Filters API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
