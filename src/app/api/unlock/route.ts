import { NextResponse } from 'next/server';
import { z } from 'zod';
import { salto } from '@/lib/salto';
import { isInsideGymGeofence } from '@/lib/geo';
import { env } from '@/lib/env';
import { supabaseServer, supabaseAdmin } from '@/lib/supabase/server';

const schema = z.object({ lat: z.number(), lon: z.number() });
const COOLDOWN_SECONDS = 30;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'Invalid input' }, { status: 400 });

  const supabase = supabaseServer();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 });

  const db = supabaseAdmin();

  // Find profile + active membership + salto user id
  const { data: profile } = await db
    .from('users')
    .select('id, salto_user_id')
    .eq('auth_id', authUser.id)
    .maybeSingle();
  if (!profile) return NextResponse.json({ ok: false, error: 'no_profile' }, { status: 403 });

  const { data: membership } = await db
    .from('memberships')
    .select('id')
    .eq('user_id', profile.id)
    .eq('status', 'active')
    .maybeSingle();
  if (!membership) return NextResponse.json({ ok: false, error: 'no_active_membership' }, { status: 403 });

  if (!isInsideGymGeofence(parsed.data.lat, parsed.data.lon)) {
    return NextResponse.json({ ok: false, error: 'outside_geofence' }, { status: 403 });
  }

  // DB-backed rate limit: refuse if there's an entry_log row in the last COOLDOWN_SECONDS.
  const cutoff = new Date(Date.now() - COOLDOWN_SECONDS * 1000).toISOString();
  const { data: recent } = await db
    .from('entry_log')
    .select('id')
    .eq('user_id', profile.id)
    .gte('occurred_at', cutoff)
    .limit(1);
  if (recent && recent.length > 0) {
    return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 });
  }

  await salto.remoteUnlock(env.salto.gymLockId || 'mock-lock');
  await db.from('entry_log').insert({
    user_id: profile.id,
    source: 'remote_unlock',
    metadata: { lat: parsed.data.lat, lon: parsed.data.lon },
  });

  await checkSharingPatterns(profile.id);

  return NextResponse.json({ ok: true });
}

// Fire-and-forget detection. Writes a row to sharing_alerts if the member's
// recent entry pattern looks like credential sharing or tailgating.
async function checkSharingPatterns(userId: string) {
  const db = supabaseAdmin();

  // 1. Rapid repeat: 2+ entries in the last 60 seconds.
  const rapidCutoff = new Date(Date.now() - 60 * 1000).toISOString();
  const { data: rapid } = await db
    .from('entry_log')
    .select('id, occurred_at')
    .eq('user_id', userId)
    .gte('occurred_at', rapidCutoff);
  if (rapid && rapid.length >= 2) {
    await flagIfMissing(userId, 'rapid_repeat', {
      count: rapid.length,
      window_seconds: 60,
    });
  }

  // 2. High-frequency day: >4 entries in the last 24h.
  const dayCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: daily } = await db
    .from('entry_log')
    .select('id')
    .eq('user_id', userId)
    .gte('occurred_at', dayCutoff);
  if (daily && daily.length > 4) {
    await flagIfMissing(userId, 'high_frequency_day', {
      count: daily.length,
      window_hours: 24,
    });
  }
}

// Only insert an alert if there isn't already an unresolved one of the same reason
// for this user — keeps the queue from filling up with duplicates.
async function flagIfMissing(userId: string, reason: string, details: Record<string, unknown>) {
  const db = supabaseAdmin();
  const { data: existing } = await db
    .from('sharing_alerts')
    .select('id')
    .eq('user_id', userId)
    .eq('reason', reason)
    .eq('resolved', false)
    .maybeSingle();
  if (existing) return;
  await db.from('sharing_alerts').insert({ user_id: userId, reason, details });
}
