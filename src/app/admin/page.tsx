import { supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function AdminHome() {
  const db = supabaseAdmin();
  const today = new Date().toISOString().slice(0, 10);

  const [activeMembers, dropinsToday, entriesToday, openAlerts] = await Promise.all([
    db.from('memberships').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    db.from('dropins').select('id', { count: 'exact', head: true }).gte('created_at', today),
    db.from('entry_log').select('id', { count: 'exact', head: true }).gte('occurred_at', today),
    db.from('sharing_alerts').select('id', { count: 'exact', head: true }).eq('resolved', false),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Oversikt</h1>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Aktive medlemmer" value={activeMembers.count ?? 0} />
        <Stat label="Drop-ins i dag" value={dropinsToday.count ?? 0} />
        <Stat label="Inngangsforsøk i dag" value={entriesToday.count ?? 0} />
        <Stat label="Åpne varsler" value={openAlerts.count ?? 0} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}
