import { NextResponse } from 'next/server';
import { salto } from '@/lib/salto';
import { sms } from '@/lib/sms';
import { email, membershipReceiptHtml } from '@/lib/email';
import { generatePin } from '@/lib/pin';
import { env } from '@/lib/env';
import { supabaseAdmin } from '@/lib/supabase/server';

// Stripe webhook receiver. In production, verify signature with STRIPE_WEBHOOK_SECRET
// using stripe.webhooks.constructEvent(rawBody, sig, secret).

export async function POST(req: Request) {
  const event = await req.json().catch(() => ({}));
  console.log('[StripeWebhook]', event?.type);
  const db = supabaseAdmin();

  switch (event?.type) {
    case 'checkout.session.completed': {
      const session = event?.data?.object ?? {};
      const sessionId: string | undefined = session.id;
      const mode = session.mode;
      if (!sessionId) break;

      if (mode === 'subscription') {
        const { data: ms } = await db
          .from('memberships')
          .select('id, user_id, users(name, phone, email), plans(name, price_nok, interval)')
          .eq('provider_agreement_id', sessionId)
          .maybeSingle();
        if (!ms) break;
        const u = ms.users as unknown as { name: string | null; phone: string; email: string | null } | null;
        const plan = ms.plans as unknown as { name: string; price_nok: number; interval: string } | null;
        const saltoUser = await salto.createUser({
          firstName: u?.name?.split(' ')[0] ?? 'Member',
          lastName: u?.name?.split(' ').slice(1).join(' ') || (u?.phone ?? ''),
        });
        await salto.addToAccessGroup(saltoUser.id, env.salto.membersGroupId || 'members');

        const periodEnd = new Date();
        if (plan?.interval === 'year') periodEnd.setFullYear(periodEnd.getFullYear() + 1);
        else periodEnd.setMonth(periodEnd.getMonth() + 1);
        await db
          .from('memberships')
          .update({ status: 'active', current_period_end: periodEnd.toISOString() })
          .eq('id', ms.id);
        await db.from('users').update({ salto_user_id: saltoUser.id }).eq('id', ms.user_id);

        const pin = generatePin(6);
        await salto.setPin(saltoUser.id, pin);
        const validUntil = new Date(Date.now() + 60 * 60 * 1000);
        await db.from('member_pins').insert({
          user_id: ms.user_id,
          pin_code: pin,
          valid_until: validUntil.toISOString(),
        });

        if (u?.email && plan) {
          await email.send({
            to: u.email,
            subject: 'Receipt – Røldal Gym membership',
            html: membershipReceiptHtml({
              name: u.name,
              planName: plan.name,
              amountKr: Math.round(plan.price_nok / 100),
              interval: plan.interval,
              nextChargeDate: periodEnd,
              provider: 'stripe',
            }),
          });
        }
      } else {
        // one-off drop-in
        const { data: dropin } = await db
          .from('dropins')
          .select('id, phone, amount_nok')
          .eq('provider_payment_id', sessionId)
          .maybeSingle();
        if (!dropin) break;
        const pin = generatePin(6);
        const saltoUser = await salto.createUser({ firstName: 'Drop', lastName: 'In', pin });
        await salto.addToAccessGroup(saltoUser.id, env.salto.dropinGroupId || 'dropin');
        const validUntil = new Date(Date.now() + 4 * 60 * 60 * 1000);
        await db
          .from('dropins')
          .update({
            status: 'paid',
            pin_code: pin,
            pin_valid_until: validUntil.toISOString(),
            salto_user_id: saltoUser.id,
          })
          .eq('id', dropin.id);
        const amountKr = Math.round(dropin.amount_nok / 100);
        await sms.send(
          dropin.phone,
          `Røldal Gym: Thanks for your purchase (${amountKr} kr). Your one-time code is ${pin}, valid for 4 hours. Welcome!`,
        );
      }
      break;
    }

    case 'invoice.payment_failed':
    case 'customer.subscription.deleted': {
      // TODO: subscription id lookup; Stripe events expose customer + subscription ids,
      // not the original checkout session id, so we'd need to also store the subscription id
      // when checkout completes. Left as a follow-up.
      break;
    }
  }

  return NextResponse.json({ received: true });
}
