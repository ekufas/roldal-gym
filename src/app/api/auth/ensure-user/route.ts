import { NextResponse } from 'next/server';
import { supabaseServer, supabaseAdmin } from '@/lib/supabase/server';

// Called by the client right after a successful OTP verify.
// Ensures a public.users row exists and is linked to the current auth user,
// merging any pre-existing phone-only row (from prior signup) into it.
export async function POST() {
  const sb = supabaseServer();
  const { data: { user: authUser } } = await sb.auth.getUser();
  if (!authUser) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const db = supabaseAdmin();
  const phone = authUser.phone ? `+${authUser.phone.replace(/^\+/, '')}` : null;

  // 1. Already linked?
  const { data: existingByAuth } = await db
    .from('users')
    .select('id')
    .eq('auth_id', authUser.id)
    .maybeSingle();
  if (existingByAuth) return NextResponse.json({ ok: true, id: existingByAuth.id });

  // 2. Phone row exists but unlinked? Link it.
  if (phone) {
    const { data: existingByPhone } = await db
      .from('users')
      .select('id, auth_id')
      .eq('phone', phone)
      .maybeSingle();
    if (existingByPhone && !existingByPhone.auth_id) {
      await db.from('users').update({ auth_id: authUser.id }).eq('id', existingByPhone.id);
      return NextResponse.json({ ok: true, id: existingByPhone.id });
    }
  }

  // 3. Create fresh row.
  const { data: created, error } = await db
    .from('users')
    .insert({ auth_id: authUser.id, phone: phone ?? '', locale: 'no' })
    .select('id')
    .single();
  if (error || !created) return NextResponse.json({ error: error?.message ?? 'failed' }, { status: 500 });
  return NextResponse.json({ ok: true, id: created.id });
}
