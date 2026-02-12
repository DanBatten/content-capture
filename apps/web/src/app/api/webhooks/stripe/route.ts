import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

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
function getPeriodEndISO(sub: Stripe.Subscription): string | null {
  const periodEnd = sub.items?.data?.[0]?.current_period_end;
  return periodEnd ? new Date(periodEnd * 1000).toISOString() : null;
}

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  const stripe = getStripe();
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const admin = getAdminClient();

  // Idempotency check
  const { data: existing } = await admin
    .from('processed_webhook_events')
    .select('event_id')
    .eq('event_id', event.id)
    .single();

  if (existing) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.supabase_user_id;
        const customerId = session.customer as string;

        if (userId && session.subscription) {
          // Fetch current subscription state from Stripe (convergent)
          const subscription = await stripe.subscriptions.retrieve(
            session.subscription as string
          );

          await admin
            .from('user_profiles')
            .update({
              tier: 'pro',
              stripe_customer_id: customerId,
              stripe_subscription_id: subscription.id,
              stripe_subscription_status: subscription.status,
              subscription_current_period_end: getPeriodEndISO(subscription),
              updated_at: new Date().toISOString(),
            })
            .eq('id', userId);
        }
        break;
      }

      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        // Re-fetch from Stripe for convergent state
        let currentSub: Stripe.Subscription;
        try {
          currentSub = await stripe.subscriptions.retrieve(subscription.id);
        } catch {
          // Subscription may have been deleted
          currentSub = subscription;
        }

        const isActive = ['active', 'trialing'].includes(currentSub.status);

        await admin
          .from('user_profiles')
          .update({
            tier: isActive ? 'pro' : 'free',
            stripe_subscription_id: currentSub.id,
            stripe_subscription_status: currentSub.status,
            subscription_current_period_end: getPeriodEndISO(currentSub),
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_customer_id', customerId);

        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        // Mark subscription status but don't immediately revoke access
        // Stripe will eventually send subscription.deleted if payment remains failed
        const subId = (invoice.parent?.subscription_details?.subscription as string) || null;
        if (subId) {
          const subscription = await stripe.subscriptions.retrieve(subId);

          await admin
            .from('user_profiles')
            .update({
              stripe_subscription_status: subscription.status,
              updated_at: new Date().toISOString(),
            })
            .eq('stripe_customer_id', customerId);
        }
        break;
      }
    }

    // Record event as processed
    await admin
      .from('processed_webhook_events')
      .insert({
        event_id: event.id,
        event_type: event.type,
      });

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook processing error:', error);
    // Return 500 so Stripe retries
    return NextResponse.json(
      { error: 'Processing failed' },
      { status: 500 }
    );
  }
}
