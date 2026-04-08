import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { supabaseServer, supabaseAdmin } from '@/lib/supabase/server';
import OpenDoorButton from './open-door-button';

export const dynamic = 'force-dynamic';

export default async function MembershipPage() {
  const t = await getTranslations();
  const supabase = supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Use service role to fetch joined data (RLS would also allow this but service role
  // is simpler for the joined query).
  const admin = supabaseAdmin();
  const { data: profile } = await admin
    .from('users')
    .select('id, name, phone')
    .eq('auth_id', user.id)
    .maybeSingle();

  const { data: membership } = profile
    ? await admin
        .from('memberships')
        .select('status, current_period_end, plan_id, plans(name)')
        .eq('user_id', profile.id)
        .in('status', ['active', 'past_due'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };

  const { data: latestPin } = profile
    ? await admin
        .from('member_pins')
        .select('pin_code, valid_until')
        .eq('user_id', profile.id)
        .eq('revoked', false)
        .order('valid_from', { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };

  const isActive = membership?.status === 'active';
  const planName = (membership?.plans as { name?: string } | null)?.name;

  return (
    <div className="space-y-6 pt-6">
      <h1 className="text-2xl font-bold">{t('membership.title')}</h1>
      <div className="rounded-xl bg-white p-4 shadow">
        <div className="text-sm text-neutral-500">{t('membership.status')}</div>
        <div className={`text-lg font-semibold ${isActive ? 'text-brand' : 'text-neutral-400'}`}>
          {isActive ? t('membership.active') : t('membership.inactive')}
        </div>
        {planName && <div className="text-sm text-neutral-500">{planName}</div>}
        {membership?.current_period_end && (
          <div className="mt-1 text-xs text-neutral-400">
            {t('membership.nextCharge')}: {new Date(membership.current_period_end).toLocaleDateString('no-NO')}
          </div>
        )}
      </div>

      {isActive && <OpenDoorButton />}

      {latestPin && (
        <div className="rounded-xl border bg-white p-4">
          <div className="text-sm text-neutral-500">{t('membership.pinTitle')}</div>
          <div className="my-2 font-mono text-3xl tracking-widest">{latestPin.pin_code}</div>
          <div className="text-xs text-neutral-500">{t('membership.pinHint')}</div>
          <div className="mt-2 text-xs text-neutral-400">
            {t('membership.nextRotation')}: {new Date(latestPin.valid_until).toLocaleTimeString('no-NO')}
          </div>
        </div>
      )}
    </div>
  );
}
