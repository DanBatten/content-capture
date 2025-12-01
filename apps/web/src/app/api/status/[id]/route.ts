import { NextRequest, NextResponse } from 'next/server';
import { getCaptureById } from '@/lib/supabase';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: 'Missing capture ID' }, { status: 400 });
    }

    const capture = await getCaptureById(id);

    if (!capture) {
      return NextResponse.json({ error: 'Capture not found' }, { status: 404 });
    }

    // Return relevant status info
    return NextResponse.json({
      id: capture.id,
      status: capture.status,
      sourceType: capture.source_type,
      title: capture.title,
      summary: capture.summary,
      topics: capture.topics,
      disciplines: capture.disciplines,
      useCases: capture.use_cases,
      errorMessage: capture.error_message,
      capturedAt: capture.captured_at,
      processedAt: capture.processed_at,
    });
  } catch (error) {
    console.error('Status check error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
