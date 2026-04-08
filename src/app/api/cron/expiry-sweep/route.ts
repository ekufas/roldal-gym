import { NextResponse } from 'next/server';
import { salto } from '@/lib/salto';
import { env } from '@/lib/env';
import { supabaseAdmin } from '@/lib/supabase/server';

// Daily: expire memberships and drop-ins whose validity has passed.
export async function GET(req: Request) {
  const auth = req.headers.get('authorization');
  if (env.cronSecret && auth !== `Bearer ${env.cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const db = supabaseAdmin();
  const now = new Date().toISOString();

  // 1. Expired memberships → mark expired, remove from members access group.
  const { data: expiredMembers } = await db
    .from('memberships')
    .select('id, user_id, users(salto_user_id)')
    .eq('status', 'active')
    .lt('current_period_end', now);

  for (const m of expiredMembers ?? []) {
    const saltoId = (m.users as unknown as { salto_user_id: string | null } | null)?.salto_user_id;
    if (saltoId) await salto.removeFromAccessGroup(saltoId, env.salto.membersGroupId || 'members');
    await db.from('memberships').update({ status: 'expired' }).eq('id', m.id);
  }

  // 2. Expired drop-ins → disable Salto user, mark expired.
  const { data: expiredDropins } = await db
    .from('dropins')
    .select('id, salto_user_id')
    .eq('status', 'paid')
    .lt('pin_valid_until', now);

  for (const d of expiredDropins ?? []) {
    if (d.salto_user_id) await salto.disableUser(d.salto_user_id);
    await db.from('dropins').update({ status: 'expired' }).eq('id', d.id);
  }

  return NextResponse.json({
    expiredMembers: expiredMembers?.length ?? 0,
    expiredDropins: expiredDropins?.length ?? 0,
  });
}
