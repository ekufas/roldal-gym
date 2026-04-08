import { NextResponse } from 'next/server';
import { z } from 'zod';
import { vipps } from '@/lib/payments/vipps';
import { stripe } from '@/lib/payments/stripe';
import { env } from '@/lib/env';
import { supabaseAdmin } from '@/lib/supabase/server';

const DROPIN_PRICE_NOK = 100;
const DROPIN_PRICE_ORE = DROPIN_PRICE_NOK * 100;

const schema = z.object({
  phone: z.string().min(5),
  provider: z.enum(['vipps', 'stripe']),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  const { phone, provider } = parsed.data;

  const db = supabaseAdmin();

  const { data: dropin, error } = await db
    .from('dropins')
    .insert({
      phone,
      provider,
      amount_nok: DROPIN_PRICE_ORE,
      status: 'pending',
    })
    .select('id')
    .single();
  if (error || !dropin) return NextResponse.json({ error: 'Dropin create failed' }, { status: 500 });

  if (provider === 'vipps') {
    const pay = await vipps.createOneOffPayment({
      phone,
      amountNok: DROPIN_PRICE_NOK,
      description: 'Røldal Gym drop-in',
      callbackPrefix: `${env.appUrl}/api/webhooks/vipps`,
    });
    await db.from('dropins').update({ provider_payment_id: pay.paymentId }).eq('id', dropin.id);
    return NextResponse.json({ redirectUrl: pay.redirectUrl });
  }

  const session = await stripe.createOneOffCheckout({
    amountNok: DROPIN_PRICE_NOK,
    description: 'Røldal Gym drop-in',
    successUrl: `${env.appUrl}/dropin?paid=1`,
    cancelUrl: `${env.appUrl}/dropin`,
  });
  await db.from('dropins').update({ provider_payment_id: session.sessionId }).eq('id', dropin.id);
  return NextResponse.json({ redirectUrl: session.url });
}
