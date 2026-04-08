import { NextResponse } from 'next/server';
import { salto } from '@/lib/salto';
import { sms } from '@/lib/sms';
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
        .select('id, user_id, users(name, phone)')
        .eq('provider_agreement_id', agreementId)
        .maybeSingle();
      if (!ms) break;

      const u = ms.users as { name: string | null; phone: string } | null;
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
      break;
    }

    case 'CHARGE.FAILED':
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
        .update({
          status: event.eventName === 'CHARGE.FAILED' ? 'past_due' : 'cancelled',
          cancelled_at: new Date().toISOString(),
        })
        .eq('id', ms.id);
      const saltoId = (ms.users as { salto_user_id: string | null } | null)?.salto_user_id;
      if (saltoId) await salto.removeFromAccessGroup(saltoId, env.salto.membersGroupId || 'members');
      break;
    }

    case 'PAYMENT.CAPTURED': {
      const paymentId: string | undefined = event.paymentId;
      if (!paymentId) break;
      const { data: dropin } = await db
        .from('dropins')
        .select('id, phone')
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

      await sms.send(dropin.phone, `Røldal Gym kode: ${pin} (gyldig 4 timer)`);
      break;
    }
  }

  return NextResponse.json({ received: true });
}
