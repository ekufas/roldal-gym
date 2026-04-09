import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

async function resolveAlert(formData: FormData) {
  'use server';
  const id = String(formData.get('id') ?? '');
  if (!id) return;
  const db = supabaseAdmin();
  await db.from('sharing_alerts').update({ resolved: true }).eq('id', id);
  revalidatePath('/admin/alerts');
}

const REASON_LABEL: Record<string, string> = {
  rapid_repeat: 'Rask gjentakelse',
  high_frequency_day: 'Høy frekvens (24t)',
};

export default async function AlertsPage({ searchParams }: { searchParams: { show?: string } }) {
  const db = supabaseAdmin();
  const showResolved = searchParams.show === 'all';

  let query = db
    .from('sharing_alerts')
    .select('id, user_id, reason, details, resolved, created_at, users(name, phone)')
    .order('created_at', { ascending: false })
    .limit(200);
  if (!showResolved) query = query.eq('resolved', false);

  const { data: rows } = await query;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Varsler</h1>
        <div className="flex gap-2 text-sm">
          <a
            href="/admin/alerts"
            className={`rounded px-3 py-1 ${!showResolved ? 'bg-brand text-white' : 'border'}`}
          >
            Åpne
          </a>
          <a
            href="/admin/alerts?show=all"
            className={`rounded px-3 py-1 ${showResolved ? 'bg-brand text-white' : 'border'}`}
          >
            Alle
          </a>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead className="border-b bg-neutral-50 text-left text-xs uppercase text-neutral-500">
            <tr>
              <th className="p-3">Tid</th>
              <th className="p-3">Navn</th>
              <th className="p-3">Telefon</th>
              <th className="p-3">Årsak</th>
              <th className="p-3">Detaljer</th>
              <th className="p-3">Status</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((a) => {
              const u = a.users as unknown as { name: string | null; phone: string } | null;
              return (
                <tr key={a.id} className="border-b last:border-0">
                  <td className="p-3 text-xs text-neutral-500 whitespace-nowrap">
                    {new Date(a.created_at).toLocaleString('no-NO')}
                  </td>
                  <td className="p-3">{u?.name ?? '—'}</td>
                  <td className="p-3 font-mono">{u?.phone ?? '—'}</td>
                  <td className="p-3">
                    <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                      {REASON_LABEL[a.reason] ?? a.reason}
                    </span>
                  </td>
                  <td className="p-3 text-xs text-neutral-500">
                    {a.details ? JSON.stringify(a.details) : '—'}
                  </td>
                  <td className="p-3">
                    {a.resolved ? (
                      <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500">Løst</span>
                    ) : (
                      <span className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-700">Åpen</span>
                    )}
                  </td>
                  <td className="p-3">
                    {!a.resolved && (
                      <form action={resolveAlert}>
                        <input type="hidden" name="id" value={a.id} />
                        <button type="submit" className="rounded border border-neutral-300 px-2 py-1 text-xs">
                          Løs
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
            {(!rows || rows.length === 0) && (
              <tr><td colSpan={7} className="p-6 text-center text-neutral-400">Ingen varsler.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
