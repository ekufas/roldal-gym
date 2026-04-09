import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { salto } from '@/lib/salto';
import { supabaseServer, supabaseAdmin } from '@/lib/supabase/server';
import OpenDoorButton from './open-door-button';
import ConfirmButton from './confirm-button';
import ReactivateButton from './reactivate-button';

export const dynamic = 'force-dynamic';

async function saveProfile(formData: FormData) {
  'use server';
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return;
  const name = String(formData.get('name') ?? '').trim() || null;
  const email = String(formData.get('email') ?? '').trim() || null;
  const db = supabaseAdmin();
  await db.from('users').update({ name, email }).eq('auth_id', user.id);
  revalidatePath('/membership');
}

async function cancelMembership() {
  'use server';
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return;
  const db = supabaseAdmin();
  const { data: profile } = await db
    .from('users')
    .select('id, salto_user_id')
    .eq('auth_id', user.id)
    .maybeSingle();
  if (!profile) return;
  await db
    .from('memberships')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
    .eq('user_id', profile.id)
    .in('status', ['active', 'past_due']);
  await db.from('member_pins').update({ revoked: true }).eq('user_id', profile.id).eq('revoked', false);
  if (profile.salto_user_id) await salto.disableUser(profile.salto_user_id);
  revalidatePath('/membership');
}

async function logout() {
  'use server';
  const sb = supabaseServer();
  await sb.auth.signOut();
  redirect('/');
}

export default async function MembershipPage() {
  const t = await getTranslations();
  const supabase = supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = supabaseAdmin();
  const { data: profile } = await admin
    .from('users')
    .select('id, name, phone, email')
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
  const isPastDue = membership?.status === 'past_due';
  const planName = (membership?.plans as unknown as { name?: string } | null)?.name;

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

      {isPastDue && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
          <h2 className="font-semibold text-amber-800">{t('membership.pastDueTitle')}</h2>
          <p className="mt-1 text-sm text-amber-900">{t('membership.pastDueHint')}</p>
          <ReactivateButton label={t('membership.reactivate')} />
        </div>
      )}

      {(isActive || isPastDue) && <OpenDoorButton />}

      {isActive && latestPin && (
        <div className="rounded-xl border bg-white p-4">
          <div className="text-sm text-neutral-500">{t('membership.pinTitle')}</div>
          <div className="my-2 font-mono text-3xl tracking-widest">{latestPin.pin_code}</div>
          <div className="text-xs text-neutral-500">{t('membership.pinHint')}</div>
          <div className="mt-2 text-xs text-neutral-400">
            {t('membership.nextRotation')}: {new Date(latestPin.valid_until).toLocaleTimeString('no-NO')}
          </div>
        </div>
      )}

      <form action={saveProfile} className="space-y-3 rounded-xl border bg-white p-4">
        <h2 className="font-semibold">{t('membership.profileTitle')}</h2>
        <label className="block text-xs text-neutral-500">
          {t('signup.name')}
          <input
            name="name"
            defaultValue={profile?.name ?? ''}
            className="mt-1 w-full rounded border px-3 py-2 text-sm text-neutral-800"
          />
        </label>
        <label className="block text-xs text-neutral-500">
          {t('signup.phone')}
          <input
            value={profile?.phone ?? ''}
            disabled
            className="mt-1 w-full rounded border bg-neutral-50 px-3 py-2 text-sm text-neutral-500"
          />
        </label>
        <label className="block text-xs text-neutral-500">
          {t('signup.email')}
          <input
            name="email"
            type="email"
            defaultValue={profile?.email ?? ''}
            className="mt-1 w-full rounded border px-3 py-2 text-sm text-neutral-800"
          />
        </label>
        <button type="submit" className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white">
          {t('membership.profileSave')}
        </button>
      </form>

      {isActive && (
        <form
          action={cancelMembership}
          className="rounded-xl border border-red-200 bg-white p-4"
        >
          <h2 className="font-semibold text-red-700">{t('membership.cancelTitle')}</h2>
          <p className="mt-1 text-xs text-neutral-500">{t('membership.cancelHint')}</p>
          <ConfirmButton
            message={t('membership.cancelConfirm')}
            className="mt-3 rounded-xl border border-red-300 px-4 py-2 text-sm font-semibold text-red-600"
          >
            {t('membership.cancelButton')}
          </ConfirmButton>
        </form>
      )}

      <form action={logout}>
        <button type="submit" className="text-xs text-neutral-500 underline">
          {t('membership.logout')}
        </button>
      </form>
    </div>
  );
}
