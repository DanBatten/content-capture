import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getStripeServer, PLANS } from '@/lib/stripe';
import { getAuthenticatedUser, unauthorizedResponse, checkCsrf } from '@/lib/api-auth';

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(request: NextRequest) {
  if (!checkCsrf(request)) {
    return NextResponse.json({ error: 'CSRF check failed' }, { status: 403 });
  }

  const auth = await getAuthenticatedUser(request);
  if (!auth) return unauthorizedResponse();

  const stripe = getStripeServer();
  const admin = getAdminClient();

  // Get or create Stripe customer
  const { data: profile } = await admin
    .from('user_profiles')
    .select('stripe_customer_id, email')
    .eq('id', auth.userId)
    .single();

  let customerId = profile?.stripe_customer_id;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: profile?.email || undefined,
      metadata: { supabase_user_id: auth.userId },
    });
    customerId = customer.id;

    await admin
      .from('user_profiles')
      .update({ stripe_customer_id: customerId, updated_at: new Date().toISOString() })
      .eq('id', auth.userId);
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: PLANS.pro.priceId, quantity: 1 }],
    success_url: `${appUrl}/settings?checkout=success`,
    cancel_url: `${appUrl}/settings?checkout=cancelled`,
    metadata: { supabase_user_id: auth.userId },
  });

  return NextResponse.json({ url: session.url });
}
