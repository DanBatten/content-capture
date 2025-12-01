import { NextRequest, NextResponse } from 'next/server';
import {
  captureRequestSchema,
  detectSourceType,
  validateUrl,
  type CaptureMessage,
} from '@content-capture/core';
import { createCapture, captureExists } from '@/lib/supabase';
import { sendToQueue } from '@/lib/pubsub';

export async function POST(request: NextRequest) {
  try {
    // Parse and validate request body
    const body = await request.json();
    const parsed = captureRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { url, notes } = parsed.data;

    // Validate URL format
    const urlValidation = validateUrl(url);
    if (!urlValidation.valid) {
      return NextResponse.json({ error: urlValidation.error }, { status: 400 });
    }

    const normalizedUrl = urlValidation.normalized!;

    // Check for duplicates
    const exists = await captureExists(normalizedUrl);
    if (exists) {
      return NextResponse.json(
        { error: 'URL already captured', code: 'DUPLICATE' },
        { status: 409 }
      );
    }

    // Detect source type
    const sourceType = detectSourceType(normalizedUrl);

    // Create pending record in Supabase
    const capture = await createCapture(normalizedUrl, sourceType, notes);
    if (!capture) {
      return NextResponse.json(
        { error: 'Failed to create capture record' },
        { status: 500 }
      );
    }

    // Send to processing queue
    const message: CaptureMessage = {
      captureId: capture.id,
      url: normalizedUrl,
      sourceType,
      notes,
    };

    const queued = await sendToQueue(message);
    if (!queued) {
      // Log error but don't fail - record exists, can retry later
      console.error('Failed to queue capture:', capture.id);
    }

    return NextResponse.json({
      id: capture.id,
      status: 'pending',
      sourceType,
    });
  } catch (error) {
    console.error('Capture error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Health check
export async function GET() {
  return NextResponse.json({ status: 'ok', service: 'capture' });
}
