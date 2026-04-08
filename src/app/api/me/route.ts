import { NextResponse } from 'next/server';
import { supabaseServer, supabaseAdmin } from '@/lib/supabase/server';

export async function GET() {
  const supabase = supabaseServer();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const db = supabaseAdmin();
  const { data: profile } = await db
    .from('users')
    .select('id, name, phone, email, locale')
    .eq('auth_id', authUser.id)
    .maybeSingle();

  if (!profile) return NextResponse.json({ profile: null, membership: null, pin: null });

  const { data: membership } = await db
    .from('memberships')
    .select('status, current_period_end, plans(name)')
    .eq('user_id', profile.id)
    .in('status', ['active', 'past_due'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: pin } = await db
    .from('member_pins')
    .select('pin_code, valid_until')
    .eq('user_id', profile.id)
    .eq('revoked', false)
    .order('valid_from', { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({ profile, membership, pin });
}
