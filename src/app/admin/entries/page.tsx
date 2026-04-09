import { supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const SOURCES = ['remote_unlock', 'pin', 'rfid', 'dropin_pin'] as const;

export default async function EntriesPage({ searchParams }: { searchParams: { q?: string; source?: string } }) {
  const db = supabaseAdmin();
  const q = (searchParams.q ?? '').trim();
  const source = searchParams.source ?? '';

  let query = db
    .from('entry_log')
    .select('id, user_id, source, occurred_at, metadata, users(name, phone)')
    .order('occurred_at', { ascending: false })
    .limit(500);

  if (source) query = query.eq('source', source);

  const { data: rows } = await query;

  const filtered = q
    ? (rows ?? []).filter((r) => {
        const u = r.users as unknown as { name: string | null; phone: string } | null;
        return u?.phone?.includes(q) || u?.name?.toLowerCase().includes(q.toLowerCase());
      })
    : rows ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Inngangslogg</h1>
        <form className="flex gap-2">
          <input name="q" defaultValue={q} placeholder="Søk navn/telefon" className="rounded border px-3 py-1 text-sm" />
          <select name="source" defaultValue={source} className="rounded border px-3 py-1 text-sm">
            <option value="">Alle kilder</option>
            {SOURCES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <button type="submit" className="rounded bg-brand px-3 py-1 text-sm text-white">Filtrer</button>
        </form>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead className="border-b bg-neutral-50 text-left text-xs uppercase text-neutral-500">
            <tr>
              <th className="p-3">Tid</th>
              <th className="p-3">Navn</th>
              <th className="p-3">Telefon</th>
              <th className="p-3">Kilde</th>
              <th className="p-3">Detaljer</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const u = r.users as unknown as { name: string | null; phone: string } | null;
              return (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="p-3 text-xs text-neutral-500 whitespace-nowrap">
                    {new Date(r.occurred_at).toLocaleString('no-NO')}
                  </td>
                  <td className="p-3">{u?.name ?? '—'}</td>
                  <td className="p-3 font-mono">{u?.phone ?? '—'}</td>
                  <td className="p-3">
                    <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs">{r.source}</span>
                  </td>
                  <td className="p-3 text-xs text-neutral-500">
                    {r.metadata ? JSON.stringify(r.metadata) : '—'}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={5} className="p-6 text-center text-neutral-400">Ingen oppføringer.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
