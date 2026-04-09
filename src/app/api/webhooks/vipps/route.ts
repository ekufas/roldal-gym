import { NextResponse } from 'next/server';
import { salto } from '@/lib/salto';
import { sms } from '@/lib/sms';
import { email, membershipReceiptHtml, paymentFailedHtml } from '@/lib/email';

// Retry schedule in days after the failure. attempt N (already recorded) → wait N more days.
const RETRY_DAYS = [3, 4, 3]; // attempt1→+3d, attempt2→+4d (total 7), attempt3→+3d (total 10)
const MAX_ATTEMPTS = 3;
import { generatePin } from '@/lib/pin';
import { env } from '@/lib/env';
import { supabaseAdmin } from '@/lib/supabase/server';

// Vipps webhook receiver. Single endpoint handling both Recurring and eCom callbacks.
// In production, verify signature header before doing anything.
//
// Event names handled:
//   AGREEMENT.ACCEPTED  → activate membership, provision Salto member
//   CHARGE.FAILED       → mark past_due, remove from Salto members group
//   AGREEMENT.STOPPED   → cancel membership, remove from Salto members group
//   PAYMENT.CAPTURED    → activate drop-in, generate PIN, SMS it

export async function POST(req: Request) {
  const event = await req.json().catch(() => ({}));
  console.log('[VippsWebhook]', event);
  const db = supabaseAdmin();

  switch (event?.eventName) {
    case 'AGREEMENT.ACCEPTED': {
      const agreementId: string | undefined = event.agreementId;
      if (!agreementId) break;

      const { data: ms } = await db
        .from('memberships')
        .select('id, user_id, users(name, phone, email), plans(name, price_nok, interval)')
        .eq('provider_agreement_id', agreementId)
        .maybeSingle();
      if (!ms) break;

      const u = ms.users as unknown as { name: string | null; phone: string; email: string | null } | null;
      const plan = ms.plans as unknown as { name: string; price_nok: number; interval: string } | null;
      const saltoUser = await salto.createUser({
        firstName: u?.name?.split(' ')[0] ?? 'Member',
        lastName: u?.name?.split(' ').slice(1).join(' ') || (u?.phone ?? ''),
      });
      await salto.addToAccessGroup(saltoUser.id, env.salto.membersGroupId || 'members');

      // Mark active and store salto user id on the user row
      const now = new Date();
      const periodEnd = new Date(now);
      periodEnd.setMonth(periodEnd.getMonth() + 1);

      await db
        .from('memberships')
        .update({ status: 'active', current_period_end: periodEnd.toISOString() })
        .eq('id', ms.id);
      await db
        .from('users')
        .update({ salto_user_id: saltoUser.id })
        .eq('id', ms.user_id);

      // Issue first rotating PIN
      const pin = generatePin(6);
      await salto.setPin(saltoUser.id, pin);
      const validUntil = new Date(now.getTime() + 60 * 60 * 1000);
      await db.from('member_pins').insert({
        user_id: ms.user_id,
        pin_code: pin,
        valid_until: validUntil.toISOString(),
      });

      if (u?.email && plan) {
        await email.send({
          to: u.email,
          subject: 'Kvittering – Røldal Gym medlemskap',
          html: membershipReceiptHtml({
            name: u.name,
            planName: plan.name,
            amountKr: Math.round(plan.price_nok / 100),
            interval: plan.interval,
            nextChargeDate: periodEnd,
            provider: 'vipps',
          }),
        });
      }
      break;
    }

    case 'CHARGE.FAILED': {
      const agreementId: string | undefined = event.agreementId;
      if (!agreementId) break;
      const { data: ms } = await db
        .from('memberships')
        .select('id, user_id, users(name, phone, email)')
        .eq('provider_agreement_id', agreementId)
        .maybeSingle();
      if (!ms) break;

      await db.from('memberships').update({ status: 'past_due' }).eq('id', ms.id);

      // Find or create open failure row, increment attempt
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
        await db
          .from('payment_failures')
          .update({
            attempt,
            next_retry_at: nextRetryAt?.toISOString() ?? null,
            last_error: event.reason ?? null,
            failed_at: new Date().toISOString(),
            notified_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
      } else {
        await db.from('payment_failures').insert({
          membership_id: ms.id,
          attempt,
          next_retry_at: nextRetryAt?.toISOString() ?? null,
          last_error: event.reason ?? null,
          notified_at: new Date().toISOString(),
        });
      }

      const u = ms.users as unknown as { name: string | null; phone: string; email: string | null } | null;
      const reactivateUrl = `${env.appUrl}/membership`;
      if (u?.phone) {
        const msg = finalAttempt
          ? `Røldal Gym: Medlemskapet er avsluttet fordi vi ikke fikk trukket betalingen. Du er velkommen tilbake når som helst via ${env.appUrl}.`
          : attempt === 1
          ? `Røldal Gym: Vipps klarte ikke å trekke månedens medlemskap. Vi prøver igjen om ${days} dager. Ingen handling kreves hvis det var midlertidig.`
          : `Røldal Gym: Betalingen feilet igjen (forsøk ${attempt}). Sjekk Vipps-avtalen din på ${reactivateUrl} hvis kortet er utløpt.`;
        await sms.send(u.phone, msg);
      }
      if (u?.email) {
        await email.send({
          to: u.email,
          subject: finalAttempt ? 'Medlemskapet er avsluttet – Røldal Gym' : 'Betalingen feilet – Røldal Gym',
          html: paymentFailedHtml({
            name: u.name,
            attempt,
            finalAttempt,
            nextRetryAt,
            reactivateUrl,
          }),
        });
      }

      if (finalAttempt) {
        // Terminal cleanup
        await db
          .from('memberships')
          .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
          .eq('id', ms.id);
        const { data: userRow } = await db
          .from('users')
          .select('salto_user_id')
          .eq('id', ms.user_id)
          .maybeSingle();
        const saltoId = userRow?.salto_user_id;
        if (saltoId) await salto.removeFromAccessGroup(saltoId, env.salto.membersGroupId || 'members');
        await db.from('member_pins').update({ revoked: true }).eq('user_id', ms.user_id).eq('revoked', false);
        if (existing) {
          await db.from('payment_failures').update({ resolved: true, resolved_at: new Date().toISOString() }).eq('id', existing.id);
        }
      }
      break;
    }

    case 'CHARGE.CAPTURED': {
      const agreementId: string | undefined = event.agreementId;
      if (!agreementId) break;
      const { data: ms } = await db
        .from('memberships')
        .select('id, status, current_period_end, user_id, users(name, email), plans(name, price_nok, interval)')
        .eq('provider_agreement_id', agreementId)
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
          subject: 'Kvittering – Røldal Gym medlemskap',
          html: membershipReceiptHtml({
            name: u.name,
            planName: plan.name,
            amountKr: Math.round(plan.price_nok / 100),
            interval: plan.interval,
            nextChargeDate: nextPeriodEnd,
            provider: 'vipps',
          }),
        });
      }
      break;
    }

    case 'AGREEMENT.STOPPED': {
      const agreementId: string | undefined = event.agreementId;
      if (!agreementId) break;
      const { data: ms } = await db
        .from('memberships')
        .select('id, user_id, users(salto_user_id)')
        .eq('provider_agreement_id', agreementId)
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

    case 'PAYMENT.CAPTURED': {
      const paymentId: string | undefined = event.paymentId;
      if (!paymentId) break;
      const { data: dropin } = await db
        .from('dropins')
        .select('id, phone, amount_nok')
        .eq('provider_payment_id', paymentId)
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
        `Røldal Gym: Takk for kjøpet (${amountKr} kr). Din engangskode er ${pin}, gyldig i 4 timer. Velkommen!`,
      );
      break;
    }
  }

  return NextResponse.json({ received: true });
}
