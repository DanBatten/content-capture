import { randomUUID } from 'crypto';

export interface LogContext {
  traceId: string;
  userId?: string;
  endpoint?: string;
}

interface LogEntry {
  timestamp: string;
  traceId: string;
  userId?: string;
  endpoint?: string;
  action: string;
  durationMs?: number;
  error?: string;
  [key: string]: unknown;
}

export function createTraceId(): string {
  return randomUUID().split('-')[0];
}

export function log(
  context: LogContext,
  action: string,
  extra?: Record<string, unknown>
): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    traceId: context.traceId,
    action,
    ...extra,
  };

  if (context.userId) entry.userId = context.userId;
  if (context.endpoint) entry.endpoint = context.endpoint;

  console.log(JSON.stringify(entry));
}

export function logError(
  context: LogContext,
  action: string,
  error: unknown,
  extra?: Record<string, unknown>
): void {
  const errorMessage =
    error instanceof Error ? error.message : String(error);

  log(context, action, { ...extra, error: errorMessage });
}

/**
 * Create a timer for measuring operation duration.
 */
export function startTimer(): () => number {
  const start = performance.now();
  return () => Math.round(performance.now() - start);
}
