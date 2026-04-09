import { NextResponse } from 'next/server';
import { vipps } from '@/lib/payments/vipps';
import { env } from '@/lib/env';
import { supabaseAdmin, supabaseServer } from '@/lib/supabase/server';

// Self-serve reactivation for past_due members: create a fresh Vipps agreement
// against the same plan. The old agreement is stopped when the new one is accepted
// (handled in the AGREEMENT.ACCEPTED webhook via provider_agreement_id swap).
export async function POST() {
  const sb = supabaseServer();
  const { data: { user: authUser } } = await sb.auth.getUser();
  if (!authUser) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const db = supabaseAdmin();
  const { data: profile } = await db
    .from('users')
    .select('id, phone')
    .eq('auth_id', authUser.id)
    .maybeSingle();
  if (!profile) return NextResponse.json({ error: 'no profile' }, { status: 404 });

  const { data: ms } = await db
    .from('memberships')
    .select('id, provider, provider_agreement_id, plans(name, price_nok, interval)')
    .eq('user_id', profile.id)
    .eq('status', 'past_due')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!ms) return NextResponse.json({ error: 'no past_due membership' }, { status: 404 });

  const plan = ms.plans as unknown as { name: string; price_nok: number; interval: string } | null;
  if (!plan) return NextResponse.json({ error: 'plan missing' }, { status: 500 });

  if (ms.provider !== 'vipps') {
    // Stripe self-serve would redirect to billing portal; not yet implemented.
    return NextResponse.json({ error: 'stripe reactivate not implemented' }, { status: 501 });
  }

  // Stop the old agreement best-effort
  if (ms.provider_agreement_id) {
    try { await vipps.stopAgreement(ms.provider_agreement_id); } catch (e) { console.error(e); }
  }

  const agr = await vipps.createRecurringAgreement({
    phone: profile.phone,
    amountNok: Math.round(plan.price_nok / 100),
    interval: plan.interval === 'month' ? 'MONTH' : 'YEAR',
    productName: `Røldal Gym ${plan.name}`,
    callbackPrefix: `${env.appUrl}/api/webhooks/vipps`,
  });

  await db
    .from('memberships')
    .update({ provider_agreement_id: agr.agreementId })
    .eq('id', ms.id);

  return NextResponse.json({ redirectUrl: agr.vippsConfirmationUrl });
}
