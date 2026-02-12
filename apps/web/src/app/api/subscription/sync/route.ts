import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, unauthorizedResponse } from '@/lib/api-auth';
import { syncSubscriptionFromStripe } from '@/lib/subscription';

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if (!auth) return unauthorizedResponse();

  const tier = await syncSubscriptionFromStripe(auth.userId);

  return NextResponse.json({ tier });
}
