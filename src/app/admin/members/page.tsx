import { supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function MembersPage() {
  const db = supabaseAdmin();
  const { data: rows } = await db
    .from('memberships')
    .select('id, status, current_period_end, users(name, phone, email), plans(name)')
    .order('created_at', { ascending: false });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Medlemmer</h1>
      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead className="border-b bg-neutral-50 text-left text-xs uppercase text-neutral-500">
            <tr>
              <th className="p-3">Navn</th>
              <th className="p-3">Telefon</th>
              <th className="p-3">Plan</th>
              <th className="p-3">Status</th>
              <th className="p-3">Neste trekk</th>
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((r) => {
              const u = r.users as unknown as { name: string | null; phone: string; email: string | null } | null;
              const p = r.plans as unknown as { name: string } | null;
              return (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="p-3">{u?.name ?? '—'}</td>
                  <td className="p-3 font-mono">{u?.phone ?? '—'}</td>
                  <td className="p-3">{p?.name ?? '—'}</td>
                  <td className="p-3">
                    <span className={statusClass(r.status)}>{r.status}</span>
                  </td>
                  <td className="p-3">
                    {r.current_period_end ? new Date(r.current_period_end).toLocaleDateString('no-NO') : '—'}
                  </td>
                </tr>
              );
            })}
            {(!rows || rows.length === 0) && (
              <tr><td colSpan={5} className="p-6 text-center text-neutral-400">Ingen medlemmer ennå.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function statusClass(s: string) {
  if (s === 'active') return 'rounded bg-green-100 px-2 py-0.5 text-green-700';
  if (s === 'past_due') return 'rounded bg-yellow-100 px-2 py-0.5 text-yellow-700';
  if (s === 'cancelled' || s === 'expired') return 'rounded bg-neutral-100 px-2 py-0.5 text-neutral-500';
  return 'rounded bg-neutral-100 px-2 py-0.5 text-neutral-500';
}
