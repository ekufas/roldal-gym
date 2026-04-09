import { NextResponse } from 'next/server';
import { salto } from '@/lib/salto';
import { sms } from '@/lib/sms';
import { email, membershipReceiptHtml, paymentFailedHtml } from '@/lib/email';

const RETRY_DAYS = [3, 4, 3];
const MAX_ATTEMPTS = 3;
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
        const subscriptionId: string | undefined = session.subscription;
        await db
          .from('memberships')
          .update({
            status: 'active',
            current_period_end: periodEnd.toISOString(),
            provider_agreement_id: subscriptionId ?? sessionId,
          })
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

    case 'invoice.payment_failed': {
      const invoice = event?.data?.object ?? {};
      const subscriptionId: string | undefined = invoice.subscription;
      if (!subscriptionId) break;
      const { data: ms } = await db
        .from('memberships')
        .select('id, user_id, users(name, phone, email)')
        .eq('provider_agreement_id', subscriptionId)
        .maybeSingle();
      if (!ms) break;
      await db.from('memberships').update({ status: 'past_due' }).eq('id', ms.id);

      const { data: existing } = await db
        .from('payment_failures')
        .select('id, attempt')
        .eq('membership_id', ms.id)
        .eq('resolved', false)
        .order('failed_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const attempt = existing ? existing.attempt + 1 : 1;
      const finalAttempt = attempt > MAX_ATTEMPTS;
      const days = RETRY_DAYS[attempt - 1];
      const nextRetryAt = !finalAttempt && days
        ? new Date(Date.now() + days * 24 * 60 * 60 * 1000)
        : null;

      if (existing) {
        await db.from('payment_failures').update({
          attempt,
          next_retry_at: nextRetryAt?.toISOString() ?? null,
          failed_at: new Date().toISOString(),
          notified_at: new Date().toISOString(),
        }).eq('id', existing.id);
      } else {
        await db.from('payment_failures').insert({
          membership_id: ms.id,
          attempt,
          next_retry_at: nextRetryAt?.toISOString() ?? null,
          notified_at: new Date().toISOString(),
        });
      }

      const u = ms.users as unknown as { name: string | null; phone: string; email: string | null } | null;
      const reactivateUrl = `${env.appUrl}/membership`;
      if (u?.email) {
        await email.send({
          to: u.email,
          subject: finalAttempt ? 'Membership cancelled – Røldal Gym' : 'Payment failed – Røldal Gym',
          html: paymentFailedHtml({ name: u.name, attempt, finalAttempt, nextRetryAt, reactivateUrl }),
        });
      }
      if (u?.phone) {
        await sms.send(u.phone, finalAttempt
          ? `Røldal Gym: Your membership has been cancelled because we could not collect payment.`
          : `Røldal Gym: A payment attempt failed. Stripe will retry automatically.`);
      }
      break;
    }

    case 'invoice.payment_succeeded': {
      const invoice = event?.data?.object ?? {};
      const subscriptionId: string | undefined = invoice.subscription;
      if (!subscriptionId) break;
      const { data: ms } = await db
        .from('memberships')
        .select('id, current_period_end, user_id, users(name, email), plans(name, price_nok, interval)')
        .eq('provider_agreement_id', subscriptionId)
        .maybeSingle();
      if (!ms) break;

      const plan = ms.plans as unknown as { name: string; price_nok: number; interval: string } | null;
      const base = ms.current_period_end && new Date(ms.current_period_end) > new Date()
        ? new Date(ms.current_period_end)
        : new Date();
      const nextPeriodEnd = new Date(base);
      if (plan?.interval === 'year') nextPeriodEnd.setFullYear(nextPeriodEnd.getFullYear() + 1);
      else nextPeriodEnd.setMonth(nextPeriodEnd.getMonth() + 1);

      await db
        .from('memberships')
        .update({ status: 'active', current_period_end: nextPeriodEnd.toISOString() })
        .eq('id', ms.id);
      await db
        .from('payment_failures')
        .update({ resolved: true, resolved_at: new Date().toISOString() })
        .eq('membership_id', ms.id)
        .eq('resolved', false);

      const u = ms.users as unknown as { name: string | null; email: string | null } | null;
      if (u?.email && plan) {
        await email.send({
          to: u.email,
          subject: 'Receipt – Røldal Gym membership',
          html: membershipReceiptHtml({
            name: u.name,
            planName: plan.name,
            amountKr: Math.round(plan.price_nok / 100),
            interval: plan.interval,
            nextChargeDate: nextPeriodEnd,
            provider: 'stripe',
          }),
        });
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event?.data?.object ?? {};
      const subscriptionId: string | undefined = sub.id;
      if (!subscriptionId) break;
      const { data: ms } = await db
        .from('memberships')
        .select('id, user_id, users(salto_user_id)')
        .eq('provider_agreement_id', subscriptionId)
        .maybeSingle();
      if (!ms) break;
      await db
        .from('memberships')
        .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
        .eq('id', ms.id);
      const saltoId = (ms.users as unknown as { salto_user_id: string | null } | null)?.salto_user_id;
      if (saltoId) await salto.removeFromAccessGroup(saltoId, env.salto.membersGroupId || 'members');
      await db.from('member_pins').update({ revoked: true }).eq('user_id', ms.user_id).eq('revoked', false);
      break;
    }
  }

  return NextResponse.json({ received: true });
}
