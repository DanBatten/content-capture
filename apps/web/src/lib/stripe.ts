import Stripe from 'stripe';
import { loadStripe } from '@stripe/stripe-js';

let stripePromise: ReturnType<typeof loadStripe> | null = null;

export function getStripeClient() {
  if (!stripePromise) {
    stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);
  }
  return stripePromise;
}

export function getStripeServer() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2026-01-28.clover',
  });
}

export const PLANS = {
  pro: {
    name: 'Archive Pro',
    priceId: process.env.STRIPE_PRO_PRICE_ID!,
  },
} as const;
