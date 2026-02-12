import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Admin health endpoint.
 * Protected by a simple admin key check.
 */
export async function GET(request: NextRequest) {
  const adminKey = request.headers.get('x-admin-key');
  if (!adminKey || adminKey !== process.env.ADMIN_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = getAdminClient();
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  // Stale pending items (older than 1 hour)
  const { count: stalePending } = await admin
    .from('content_items')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')
    .lt('created_at', oneHourAgo);

  // Failed items in last 24h
  const { count: recentFailed } = await admin
    .from('content_items')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'failed')
    .gt('created_at', oneDayAgo);

  // Pro users with expired subscriptions (potential drift)
  const { count: driftedPro } = await admin
    .from('user_profiles')
    .select('id', { count: 'exact', head: true })
    .eq('tier', 'pro')
    .lt('subscription_current_period_end', now.toISOString());

  // Recent webhook processing (last 24h)
  const { count: recentWebhooks } = await admin
    .from('processed_webhook_events')
    .select('event_id', { count: 'exact', head: true })
    .gt('processed_at', oneDayAgo);

  return NextResponse.json({
    status: 'ok',
    timestamp: now.toISOString(),
    metrics: {
      stalePendingItems: stalePending || 0,
      failedItemsLast24h: recentFailed || 0,
      proUsersWithExpiredSubscription: driftedPro || 0,
      webhooksProcessedLast24h: recentWebhooks || 0,
    },
  });
}
