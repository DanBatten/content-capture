import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { tierFromPriceId } from './stripe';

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2026-01-28.clover',
  });
}

/**
 * Extract current_period_end from subscription items.
 * In Stripe API v2026+, period info is on SubscriptionItem, not Subscription.
 */
function getSubscriptionPeriodEnd(sub: Stripe.Subscription): number | null {
  const firstItem = sub.items?.data?.[0];
  return firstItem?.current_period_end ?? null;
}

/**
 * Get user tier from profile, validating subscription is active.
 */
export async function getUserTier(userId: string): Promise<'free' | 'basic' | 'pro'> {
  const admin = getAdminClient();
  const { data } = await admin
    .from('user_profiles')
    .select('tier, stripe_subscription_status, subscription_current_period_end')
    .eq('id', userId)
    .single();

  if (!data || data.tier === 'free' || !data.tier) return 'free';

  const status = data.stripe_subscription_status;
  if (status && !['active', 'trialing'].includes(status)) return 'free';

  const periodEnd = data.subscription_current_period_end;
  if (periodEnd && new Date(periodEnd) < new Date()) return 'free';

  return data.tier as 'basic' | 'pro';
}

/**
 * Sync subscription state from Stripe API into local DB.
 * Called on 403 "refresh" requests and by reconciliation.
 */
export async function syncSubscriptionFromStripe(userId: string): Promise<'free' | 'basic' | 'pro'> {
  const admin = getAdminClient();
  const stripe = getStripe();

  // Get the user's Stripe customer ID
  const { data: profile } = await admin
    .from('user_profiles')
    .select('stripe_customer_id')
    .eq('id', userId)
    .single();

  if (!profile?.stripe_customer_id) {
    return 'free';
  }

  // Fetch active subscriptions from Stripe
  const subscriptions = await stripe.subscriptions.list({
    customer: profile.stripe_customer_id,
    status: 'all',
    limit: 1,
  });

  const sub = subscriptions.data[0];

  if (!sub || !['active', 'trialing'].includes(sub.status)) {
    // No active subscription - revert to free
    await admin
      .from('user_profiles')
      .update({
        tier: 'free',
        stripe_subscription_id: sub?.id || null,
        stripe_subscription_status: sub?.status || null,
        subscription_current_period_end: sub
          ? (() => { const pe = getSubscriptionPeriodEnd(sub); return pe ? new Date(pe * 1000).toISOString() : null; })()
          : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    return 'free';
  }

  // Active subscription - determine tier from price
  const priceId = sub.items?.data?.[0]?.price?.id;
  const tier = priceId ? tierFromPriceId(priceId) : 'basic';
  const resolvedTier = tier === 'free' ? 'basic' : tier; // Active sub is at least basic

  await admin
    .from('user_profiles')
    .update({
      tier: resolvedTier,
      stripe_subscription_id: sub.id,
      stripe_subscription_status: sub.status,
      subscription_current_period_end: (() => { const pe = getSubscriptionPeriodEnd(sub); return pe ? new Date(pe * 1000).toISOString() : null; })(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  return resolvedTier;
}
