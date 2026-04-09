import { notFound } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { salto } from '@/lib/salto';
import { supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

async function cancelMembership(formData: FormData) {
  'use server';
  const id = String(formData.get('id') ?? '');
  const userId = String(formData.get('user_id') ?? '');
  if (!id) return;
  const db = supabaseAdmin();
  await db
    .from('memberships')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
    .eq('id', id);
  const { data: u } = await db.from('users').select('salto_user_id').eq('id', userId).maybeSingle();
  if (u?.salto_user_id) await salto.disableUser(u.salto_user_id);
  revalidatePath(`/admin/members/${userId}`);
}

async function toggleAdmin(formData: FormData) {
  'use server';
  const userId = String(formData.get('user_id') ?? '');
  const next = formData.get('next') === '1';
  if (!userId) return;
  const db = supabaseAdmin();
  await db.from('users').update({ is_admin: next }).eq('id', userId);
  revalidatePath(`/admin/members/${userId}`);
}

export default async function MemberDetailPage({ params }: { params: { id: string } }) {
  const db = supabaseAdmin();
  const { data: user } = await db
    .from('users')
    .select('id, name, phone, email, locale, is_admin, salto_user_id, created_at')
    .eq('id', params.id)
    .maybeSingle();
  if (!user) notFound();

  const [{ data: memberships }, { data: pins }, { data: entries }, { data: alerts }, { data: dropins }] =
    await Promise.all([
      db
        .from('memberships')
        .select('id, status, current_period_end, provider, provider_agreement_id, cancelled_at, created_at, plans(name)')
        .eq('user_id', params.id)
        .order('created_at', { ascending: false }),
      db
        .from('member_pins')
        .select('id, pin_code, valid_from, valid_until, revoked')
        .eq('user_id', params.id)
        .order('valid_from', { ascending: false })
        .limit(5),
      db
        .from('entry_log')
        .select('id, source, occurred_at, metadata')
        .eq('user_id', params.id)
        .order('occurred_at', { ascending: false })
        .limit(20),
      db
        .from('sharing_alerts')
        .select('id, reason, details, resolved, created_at')
        .eq('user_id', params.id)
        .order('created_at', { ascending: false })
        .limit(20),
      db
        .from('dropins')
        .select('id, status, amount_nok, provider, created_at, pin_valid_until')
        .eq('user_id', params.id)
        .order('created_at', { ascending: false })
        .limit(10),
    ]);

  const activePin = (pins ?? []).find((p) => !p.revoked && new Date(p.valid_until).getTime() > Date.now());

  return (
    <div className="space-y-6">
      <div>
        <a href="/admin/members" className="text-xs text-neutral-500 hover:underline">← Medlemmer</a>
        <h1 className="mt-1 text-2xl font-bold">{user.name ?? '(uten navn)'}</h1>
        <div className="mt-1 text-sm text-neutral-600">
          <span className="font-mono">{user.phone}</span>
          {user.email && <> · {user.email}</>}
          {user.is_admin && <span className="ml-2 rounded bg-brand px-2 py-0.5 text-xs text-white">Admin</span>}
        </div>
        <div className="mt-1 text-xs text-neutral-500">
          Opprettet {new Date(user.created_at).toLocaleString('no-NO')}
          {user.salto_user_id && <> · Salto ID: <span className="font-mono">{user.salto_user_id}</span></>}
        </div>
        <form action={toggleAdmin} className="mt-3">
          <input type="hidden" name="user_id" value={user.id} />
          <input type="hidden" name="next" value={user.is_admin ? '0' : '1'} />
          <button type="submit" className="rounded border px-3 py-1 text-xs">
            {user.is_admin ? 'Fjern admin' : 'Gjør til admin'}
          </button>
        </form>
      </div>

      <section className="rounded-xl border bg-white p-4">
        <h2 className="mb-3 font-semibold">Medlemskap</h2>
        <div className="space-y-2">
          {(memberships ?? []).map((m) => {
            const p = m.plans as unknown as { name: string } | null;
            return (
              <div key={m.id} className="flex items-center justify-between rounded border p-3 text-sm">
                <div>
                  <div className="font-medium">{p?.name ?? '—'}</div>
                  <div className="text-xs text-neutral-500">
                    {m.provider} · {m.status}
                    {m.current_period_end && <> · Neste trekk {new Date(m.current_period_end).toLocaleDateString('no-NO')}</>}
                  </div>
                </div>
                {m.status === 'active' && (
                  <form action={cancelMembership}>
                    <input type="hidden" name="id" value={m.id} />
                    <input type="hidden" name="user_id" value={user.id} />
                    <button type="submit" className="rounded border border-red-300 px-2 py-1 text-xs text-red-600">
                      Avslutt
                    </button>
                  </form>
                )}
              </div>
            );
          })}
          {(memberships ?? []).length === 0 && <div className="text-sm text-neutral-400">Ingen medlemskap.</div>}
        </div>
      </section>

      <section className="rounded-xl border bg-white p-4">
        <h2 className="mb-3 font-semibold">Aktiv PIN</h2>
        {activePin ? (
          <div className="text-sm">
            <span className="font-mono text-lg">{activePin.pin_code}</span>
            <span className="ml-3 text-xs text-neutral-500">
              Gyldig til {new Date(activePin.valid_until).toLocaleString('no-NO')}
            </span>
          </div>
        ) : (
          <div className="text-sm text-neutral-400">Ingen aktiv PIN.</div>
        )}
      </section>

      <section className="rounded-xl border bg-white p-4">
        <h2 className="mb-3 font-semibold">Siste inngang (20)</h2>
        <div className="space-y-1 text-sm">
          {(entries ?? []).map((e) => (
            <div key={e.id} className="flex justify-between border-b py-1 last:border-0">
              <span className="text-xs text-neutral-500">{new Date(e.occurred_at).toLocaleString('no-NO')}</span>
              <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs">{e.source}</span>
            </div>
          ))}
          {(entries ?? []).length === 0 && <div className="text-neutral-400">Ingen inngang.</div>}
        </div>
      </section>

      <section className="rounded-xl border bg-white p-4">
        <h2 className="mb-3 font-semibold">Varsler</h2>
        <div className="space-y-1 text-sm">
          {(alerts ?? []).map((a) => (
            <div key={a.id} className="flex items-center justify-between border-b py-1 last:border-0">
              <span>
                <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">{a.reason}</span>
                <span className="ml-2 text-xs text-neutral-500">{new Date(a.created_at).toLocaleString('no-NO')}</span>
              </span>
              <span className="text-xs text-neutral-500">{a.resolved ? 'løst' : 'åpen'}</span>
            </div>
          ))}
          {(alerts ?? []).length === 0 && <div className="text-neutral-400">Ingen varsler.</div>}
        </div>
      </section>

      {(dropins ?? []).length > 0 && (
        <section className="rounded-xl border bg-white p-4">
          <h2 className="mb-3 font-semibold">Drop-ins</h2>
          <div className="space-y-1 text-sm">
            {(dropins ?? []).map((d) => (
              <div key={d.id} className="flex justify-between border-b py-1 last:border-0">
                <span className="text-xs text-neutral-500">{new Date(d.created_at).toLocaleString('no-NO')}</span>
                <span>
                  {Math.round(d.amount_nok / 100)} kr · {d.provider} ·{' '}
                  <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs">{d.status}</span>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
