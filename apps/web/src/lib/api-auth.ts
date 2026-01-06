import { NextRequest, NextResponse } from 'next/server';

/**
 * Validates the API key from the request headers.
 * Expects: Authorization: Bearer <api-key>
 * Or: X-API-Key: <api-key>
 *
 * Returns null if valid, or a NextResponse error if invalid.
 */
export function validateApiKey(request: NextRequest): NextResponse | null {
  const apiKey = process.env.EXTERNAL_API_KEY;

  // If no API key is configured, allow all requests (development mode)
  if (!apiKey) {
    console.warn('EXTERNAL_API_KEY not set - API authentication disabled');
    return null;
  }

  // Check Authorization header (Bearer token)
  const authHeader = request.headers.get('authorization');
  if (authHeader) {
    const [scheme, token] = authHeader.split(' ');
    if (scheme?.toLowerCase() === 'bearer' && token === apiKey) {
      return null; // Valid
    }
  }

  // Check X-API-Key header
  const xApiKey = request.headers.get('x-api-key');
  if (xApiKey === apiKey) {
    return null; // Valid
  }

  // Invalid or missing API key
  return NextResponse.json(
    { error: 'Unauthorized - Invalid or missing API key' },
    { status: 401 }
  );
}

/**
 * Helper to check if request is from the same origin (browser requests from the app itself)
 * These don't need API key authentication
 */
export function isSameOriginRequest(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');

  // Allow requests from the app itself
  const allowedOrigins = [
    'https://archivvve.com',
    'https://www.archivvve.com',
    'http://localhost:3000',
    'http://localhost:3001',
  ];

  if (origin && allowedOrigins.some(allowed => origin.startsWith(allowed))) {
    return true;
  }

  if (referer && allowedOrigins.some(allowed => referer.startsWith(allowed))) {
    return true;
  }

  return false;
}

/**
 * Combined auth check - allows same-origin requests OR valid API key
 */
export function requireAuth(request: NextRequest): NextResponse | null {
  // Allow same-origin requests (from the web app itself)
  if (isSameOriginRequest(request)) {
    return null;
  }

  // Otherwise require API key
  return validateApiKey(request);
}
