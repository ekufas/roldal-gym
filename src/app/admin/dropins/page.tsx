import { revalidatePath } from 'next/cache';
import { salto } from '@/lib/salto';
import { supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

async function revokeDropin(formData: FormData) {
  'use server';
  const id = String(formData.get('id') ?? '');
  if (!id) return;
  const db = supabaseAdmin();
  const { data: row } = await db.from('dropins').select('salto_user_id').eq('id', id).maybeSingle();
  if (row?.salto_user_id) {
    await salto.disableUser(row.salto_user_id);
  }
  await db.from('dropins').update({ status: 'expired', pin_valid_until: new Date().toISOString() }).eq('id', id);
  revalidatePath('/admin/dropins');
}

export default async function DropinsPage({ searchParams }: { searchParams: { q?: string } }) {
  const db = supabaseAdmin();
  const q = (searchParams.q ?? '').trim();

  let query = db
    .from('dropins')
    .select('id, phone, provider, amount_nok, status, pin_code, pin_valid_until, created_at')
    .order('created_at', { ascending: false })
    .limit(200);

  if (q) query = query.ilike('phone', `%${q}%`);

  const { data: rows } = await query;
  const now = Date.now();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Drop-ins</h1>
        <form className="flex gap-2">
          <input name="q" defaultValue={q} placeholder="Søk telefon" className="rounded border px-3 py-1 text-sm" />
          <button type="submit" className="rounded bg-brand px-3 py-1 text-sm text-white">Søk</button>
        </form>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead className="border-b bg-neutral-50 text-left text-xs uppercase text-neutral-500">
            <tr>
              <th className="p-3">Tid</th>
              <th className="p-3">Telefon</th>
              <th className="p-3">Metode</th>
              <th className="p-3">Beløp</th>
              <th className="p-3">Status</th>
              <th className="p-3">PIN</th>
              <th className="p-3">Gyldig til</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((d) => {
              const active = d.status === 'paid' && d.pin_valid_until && new Date(d.pin_valid_until).getTime() > now;
              return (
                <tr key={d.id} className="border-b last:border-0">
                  <td className="p-3 text-xs text-neutral-500">{new Date(d.created_at).toLocaleString('no-NO')}</td>
                  <td className="p-3 font-mono">{d.phone}</td>
                  <td className="p-3">{d.provider}</td>
                  <td className="p-3">{Math.round(d.amount_nok / 100)} kr</td>
                  <td className="p-3">
                    <span className={statusClass(d.status)}>{d.status}</span>
                  </td>
                  <td className="p-3 font-mono">{active ? d.pin_code : '—'}</td>
                  <td className="p-3 text-xs">
                    {d.pin_valid_until ? new Date(d.pin_valid_until).toLocaleString('no-NO') : '—'}
                  </td>
                  <td className="p-3">
                    {active && (
                      <form action={revokeDropin}>
                        <input type="hidden" name="id" value={d.id} />
                        <button type="submit" className="rounded border border-red-300 px-2 py-1 text-xs text-red-600">
                          Revoke
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
            {(!rows || rows.length === 0) && (
              <tr><td colSpan={8} className="p-6 text-center text-neutral-400">Ingen drop-ins.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function statusClass(s: string) {
  if (s === 'paid') return 'rounded bg-green-100 px-2 py-0.5 text-green-700';
  if (s === 'pending') return 'rounded bg-yellow-100 px-2 py-0.5 text-yellow-700';
  return 'rounded bg-neutral-100 px-2 py-0.5 text-neutral-500';
}
