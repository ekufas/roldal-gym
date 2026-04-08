import { NextResponse } from 'next/server';
import { salto } from '@/lib/salto';
import { generatePin } from '@/lib/pin';
import { env } from '@/lib/env';
import { supabaseAdmin } from '@/lib/supabase/server';

// Hourly: rotate every active member's backup PIN.
export async function GET(req: Request) {
  const auth = req.headers.get('authorization');
  if (env.cronSecret && auth !== `Bearer ${env.cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const db = supabaseAdmin();
  const { data: members } = await db
    .from('memberships')
    .select('user_id, users(id, salto_user_id)')
    .eq('status', 'active');

  let rotated = 0;
  for (const m of members ?? []) {
    const u = m.users as unknown as { id: string; salto_user_id: string | null } | null;
    if (!u?.salto_user_id) continue;

    const pin = generatePin(6);
    await salto.setPin(u.salto_user_id, pin);

    const validUntil = new Date(Date.now() + 60 * 60 * 1000);
    await db.from('member_pins').update({ revoked: true }).eq('user_id', u.id).eq('revoked', false);
    await db.from('member_pins').insert({
      user_id: u.id,
      pin_code: pin,
      valid_until: validUntil.toISOString(),
    });
    rotated++;
  }

  return NextResponse.json({ rotated });
}
