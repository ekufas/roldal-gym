import { NextResponse } from 'next/server';
import { vipps } from '@/lib/payments/vipps';
import { env } from '@/lib/env';
import { supabaseAdmin } from '@/lib/supabase/server';

// Daily: for each open payment_failures row whose next_retry_at has passed,
// schedule a fresh Vipps charge against the agreement. The resulting
// CHARGE.CAPTURED or CHARGE.FAILED webhook will update state.
export async function GET(req: Request) {
  const auth = req.headers.get('authorization');
  if (env.cronSecret && auth !== `Bearer ${env.cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const db = supabaseAdmin();
  const { data: rows } = await db
    .from('payment_failures')
    .select('id, membership_id, attempt, memberships(id, provider_agreement_id, plans(name, price_nok))')
    .eq('resolved', false)
    .lte('next_retry_at', new Date().toISOString());

  let scheduled = 0;
  for (const row of rows ?? []) {
    const ms = row.memberships as unknown as {
      id: string;
      provider_agreement_id: string | null;
      plans: { name: string; price_nok: number } | null;
    } | null;
    if (!ms?.provider_agreement_id || !ms.plans) continue;
    try {
      await vipps.createCharge({
        agreementId: ms.provider_agreement_id,
        amountNok: Math.round(ms.plans.price_nok / 100),
        description: `${ms.plans.name} – retry ${row.attempt}`,
      });
      scheduled++;
    } catch (err) {
      console.error('[retry-failed-charges] createCharge failed', err);
    }
  }

  return NextResponse.json({ scheduled });
}
