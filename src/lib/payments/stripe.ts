// Stripe client (Checkout for drop-in, Subscriptions for membership).
// Mock-first; toggle to real via STRIPE_USE_MOCK=false (or USE_MOCKS=false).

import Stripe from 'stripe';
import { env } from '../env';

export interface StripeCheckoutSession {
  sessionId: string;
  url: string;
}

export interface StripeClient {
  createSubscriptionCheckout(input: {
    email?: string;
    amountNok: number;
    interval: 'month' | 'year';
    productName: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<StripeCheckoutSession>;
  createOneOffCheckout(input: {
    email?: string;
    amountNok: number;
    description: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<StripeCheckoutSession>;
}

const mockClient: StripeClient = {
  async createSubscriptionCheckout({ productName }) {
    const id = `mock-sub-${crypto.randomUUID()}`;
    console.log('[StripeMock] subscription', productName, '→', id);
    return { sessionId: id, url: `${env.appUrl}/mock/stripe/checkout?session=${id}` };
  },
  async createOneOffCheckout({ description }) {
    const id = `mock-cs-${crypto.randomUUID()}`;
    console.log('[StripeMock] checkout', description, '→', id);
    return { sessionId: id, url: `${env.appUrl}/mock/stripe/checkout?session=${id}` };
  },
};

// --- Real client ---

let sdk: Stripe | null = null;
function getSdk(): Stripe {
  if (!sdk) sdk = new Stripe(env.stripe.secret, { apiVersion: '2024-06-20' as Stripe.LatestApiVersion });
  return sdk;
}

const realClient: StripeClient = {
  async createSubscriptionCheckout({ email, amountNok, interval, productName, successUrl, cancelUrl }) {
    const session = await getSdk().checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer_email: email,
      line_items: [{
        price_data: {
          currency: 'nok',
          product_data: { name: productName },
          unit_amount: amountNok * 100,
          recurring: { interval },
        },
        quantity: 1,
      }],
      success_url: successUrl,
      cancel_url: cancelUrl,
    });
    console.log('[Stripe] subscription session →', session.id);
    return { sessionId: session.id, url: session.url ?? '' };
  },

  async createOneOffCheckout({ email, amountNok, description, successUrl, cancelUrl }) {
    const session = await getSdk().checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: email,
      line_items: [{
        price_data: {
          currency: 'nok',
          product_data: { name: description },
          unit_amount: amountNok * 100,
        },
        quantity: 1,
      }],
      success_url: successUrl,
      cancel_url: cancelUrl,
    });
    console.log('[Stripe] one-off session →', session.id);
    return { sessionId: session.id, url: session.url ?? '' };
  },
};

const useMock = process.env.STRIPE_USE_MOCK !== undefined
  ? process.env.STRIPE_USE_MOCK !== 'false'
  : env.useMocks;

export const stripe: StripeClient = useMock ? mockClient : realClient;
