import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

const MIN_SECONDS_BETWEEN = 60;
const MAX_PER_DAY = 5;

export async function POST(req: Request) {
  const { phone } = await req.json().catch(() => ({ phone: '' }));
  if (!phone || typeof phone !== 'string') {
    return NextResponse.json({ ok: false, reason: 'invalid' }, { status: 400 });
  }

  const db = supabaseAdmin();
  const nowMs = Date.now();
  const dayCutoff = new Date(nowMs - 24 * 60 * 60 * 1000).toISOString();

  const { data } = await db
    .from('otp_sends')
    .select('sent_at')
    .eq('phone', phone)
    .gte('sent_at', dayCutoff)
    .order('sent_at', { ascending: false });

  const rows = data ?? [];
  if (rows.length >= MAX_PER_DAY) {
    return NextResponse.json({ ok: false, reason: 'daily_limit' });
  }
  if (rows.length > 0) {
    const lastMs = new Date(rows[0].sent_at).getTime();
    const elapsed = Math.floor((nowMs - lastMs) / 1000);
    if (elapsed < MIN_SECONDS_BETWEEN) {
      return NextResponse.json({
        ok: false,
        reason: 'cooldown',
        retryInSeconds: MIN_SECONDS_BETWEEN - elapsed,
      });
    }
  }
  return NextResponse.json({ ok: true });
}
