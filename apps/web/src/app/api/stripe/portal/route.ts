import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getStripeServer } from '@/lib/stripe';
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

  const admin = getAdminClient();
  const { data: profile } = await admin
    .from('user_profiles')
    .select('stripe_customer_id')
    .eq('id', auth.userId)
    .single();

  if (!profile?.stripe_customer_id) {
    return NextResponse.json(
      { error: 'No billing account found. Please subscribe first.' },
      { status: 400 }
    );
  }

  const stripe = getStripeServer();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  const session = await stripe.billingPortal.sessions.create({
    customer: profile.stripe_customer_id,
    return_url: `${appUrl}/settings?sync=true`,
  });

  return NextResponse.json({ url: session.url });
}
