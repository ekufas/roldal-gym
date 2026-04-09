import { NextResponse } from 'next/server';
import { sms } from '@/lib/sms';
import { supabaseAdmin } from '@/lib/supabase/server';

// Supabase Auth "Send SMS Hook" receiver.
// Configure in Supabase dashboard:
//   Authentication → Hooks → Send SMS Hook
//   URL: https://<your-public-url>/api/auth/sms-hook
//   Secret: paste into SUPABASE_SMS_HOOK_SECRET in .env.local

const MIN_SECONDS_BETWEEN = 60;
const MAX_PER_DAY = 5;

export async function POST(req: Request) {
  const expected = process.env.SUPABASE_SMS_HOOK_SECRET;
  if (expected) {
    const auth = req.headers.get('authorization') ?? '';
    const bearer = auth.replace(/^Bearer\s+/i, '');
    const alt = req.headers.get('x-supabase-secret') ?? req.headers.get('webhook-secret') ?? '';
    if (bearer !== expected && alt !== expected) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  }

  const body = await req.json().catch(() => ({}));
  const phone: string | undefined = body?.user?.phone;
  const otp: string | undefined = body?.sms?.otp;
  if (!phone || !otp) {
    return NextResponse.json({ error: 'invalid payload' }, { status: 400 });
  }

  // App-level rate limit: protect Sveve cost.
  const db = supabaseAdmin();
  const nowMs = Date.now();
  const cooldownCutoff = new Date(nowMs - MIN_SECONDS_BETWEEN * 1000).toISOString();
  const dayCutoff = new Date(nowMs - 24 * 60 * 60 * 1000).toISOString();

  const { data: recent } = await db
    .from('otp_sends')
    .select('sent_at')
    .eq('phone', phone)
    .gte('sent_at', dayCutoff)
    .order('sent_at', { ascending: false });

  const rows = recent ?? [];
  if (rows.length >= MAX_PER_DAY) {
    return NextResponse.json({ error: 'daily_limit' }, { status: 429 });
  }
  if (rows.length > 0 && rows[0].sent_at >= cooldownCutoff) {
    return NextResponse.json({ error: 'cooldown' }, { status: 429 });
  }

  await db.from('otp_sends').insert({ phone });
  await sms.send(phone, `Røldal Gym innloggingskode: ${otp}`);
  return NextResponse.json({ ok: true });
}
