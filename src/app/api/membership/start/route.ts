import { NextResponse } from 'next/server';
import { z } from 'zod';
import { vipps } from '@/lib/payments/vipps';
import { stripe } from '@/lib/payments/stripe';
import { env } from '@/lib/env';
import { supabaseAdmin, supabaseServer } from '@/lib/supabase/server';

const schema = z.object({
  planId: z.string().uuid(),
  name: z.string().min(1),
  phone: z.string().min(5),
  email: z.string().email().optional().or(z.literal('')),
  provider: z.enum(['vipps', 'stripe']),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  const { planId, name, phone, email, provider } = parsed.data;

  const db = supabaseAdmin();

  const { data: plan, error: planError } = await db
    .from('plans')
    .select('id, name, price_nok, interval')
    .eq('id', planId)
    .eq('active', true)
    .maybeSingle();
  if (planError || !plan) return NextResponse.json({ error: 'Unknown plan' }, { status: 400 });

  // If the visitor is logged in, link the membership to their existing users row
  // (created by the auth trigger) instead of upserting a separate row by phone.
  const sb = supabaseServer();
  const { data: { user: authUser } } = await sb.auth.getUser();

  let user: { id: string } | null = null;
  if (authUser) {
    const { data: existing } = await db
      .from('users')
      .select('id')
      .eq('auth_id', authUser.id)
      .maybeSingle();
    if (existing) {
      await db.from('users').update({ name, email: email || null, phone }).eq('id', existing.id);
      user = existing;
    }
  }
  if (!user) {
    const { data: upserted, error: userError } = await db
      .from('users')
      .upsert({ phone, name, email: email || null }, { onConflict: 'phone' })
      .select('id')
      .single();
    if (userError || !upserted) return NextResponse.json({ error: 'User upsert failed' }, { status: 500 });
    user = upserted;
  }

  // Create pending membership row first so the webhook can find it.
  const { data: membership, error: msErr } = await db
    .from('memberships')
    .insert({
      user_id: user.id,
      plan_id: plan.id,
      status: 'pending',
      provider,
    })
    .select('id')
    .single();
  if (msErr || !membership) return NextResponse.json({ error: 'Membership create failed' }, { status: 500 });

  const amountNok = Math.round(plan.price_nok / 100); // schema stores øre, vipps wants kroner

  if (provider === 'vipps') {
    const agr = await vipps.createRecurringAgreement({
      phone,
      amountNok,
      interval: plan.interval === 'month' ? 'MONTH' : 'YEAR',
      productName: `Røldal Gym ${plan.name}`,
      callbackPrefix: `${env.appUrl}/api/webhooks/vipps`,
    });
    await db
      .from('memberships')
      .update({ provider_agreement_id: agr.agreementId })
      .eq('id', membership.id);
    return NextResponse.json({ redirectUrl: agr.vippsConfirmationUrl });
  }

  const session = await stripe.createSubscriptionCheckout({
    email: email || undefined,
    amountNok,
    interval: plan.interval as 'month' | 'year',
    productName: `Røldal Gym ${plan.name}`,
    successUrl: `${env.appUrl}/membership?welcome=1`,
    cancelUrl: `${env.appUrl}/plans`,
  });
  await db
    .from('memberships')
    .update({ provider_agreement_id: session.sessionId })
    .eq('id', membership.id);
  return NextResponse.json({ redirectUrl: session.url });
}
