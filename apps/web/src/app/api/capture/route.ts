import { NextRequest, NextResponse } from 'next/server';
import {
  captureRequestSchema,
  detectSourceType,
  validateUrl,
  type CaptureMessage,
} from '@content-capture/core';
import { createCapture, captureExists } from '@/lib/supabase';
import { sendToQueue } from '@/lib/pubsub';
import { getAuthenticatedUser, unauthorizedResponse, hasScope, checkCsrf } from '@/lib/api-auth';
import { randomUUID } from 'crypto';

export async function POST(request: NextRequest) {
  // Authenticate
  const auth = await getAuthenticatedUser(request);
  if (!auth) return unauthorizedResponse();

  // Scope check for API key auth
  if (!hasScope(auth, 'capture')) {
    return NextResponse.json(
      { error: 'Insufficient scope. Required: capture' },
      { status: 403 }
    );
  }

  // CSRF check for mutation
  if (!checkCsrf(request)) {
    return NextResponse.json({ error: 'CSRF validation failed' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const parsed = captureRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { url, notes } = parsed.data;

    const urlValidation = validateUrl(url);
    if (!urlValidation.valid) {
      return NextResponse.json({ error: urlValidation.error }, { status: 400 });
    }

    const normalizedUrl = urlValidation.normalized!;

    // Per-user duplicate check
    const exists = await captureExists(normalizedUrl, auth.userId);
    if (exists) {
      return NextResponse.json(
        { error: 'URL already captured', code: 'DUPLICATE' },
        { status: 409 }
      );
    }

    const sourceType = detectSourceType(normalizedUrl);

    // Create capture with userId
    const capture = await createCapture(normalizedUrl, sourceType, auth.userId, notes);
    if (!capture) {
      return NextResponse.json(
        { error: 'Failed to create capture record' },
        { status: 500 }
      );
    }

    const traceId = randomUUID();

    // Send to processing queue with userId and traceId
    const message: CaptureMessage = {
      captureId: capture.id,
      url: normalizedUrl,
      sourceType,
      notes,
      userId: auth.userId,
      traceId,
    };

    const queued = await sendToQueue(message);
    if (!queued) {
      // Return 503 on queue failure instead of silently succeeding
      console.error('Failed to queue capture:', capture.id);
      return NextResponse.json(
        { error: 'Failed to queue for processing. Please retry.' },
        { status: 503 }
      );
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
