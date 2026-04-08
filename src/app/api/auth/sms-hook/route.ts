import { NextResponse } from 'next/server';
import { sms } from '@/lib/sms';

// Supabase Auth "Send SMS Hook" receiver.
// Configure in Supabase dashboard:
//   Authentication → Hooks → Send SMS Hook
//   URL: https://<your-public-url>/api/auth/sms-hook
//   Secret: paste into SUPABASE_SMS_HOOK_SECRET in .env.local
//
// Supabase posts a body shaped like:
//   { user: { phone: '+47...', ... }, sms: { otp: '123456' } }
// and signs it with a Standard Webhooks signature header `webhook-signature`.

export async function POST(req: Request) {
  // For dev simplicity we use a shared-secret header check rather than full
  // Standard Webhooks signature verification. Tighten before going to prod.
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

  await sms.send(phone, `Røldal Gym innloggingskode: ${otp}`);
  return NextResponse.json({ ok: true });
}
