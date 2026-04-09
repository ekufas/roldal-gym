import { supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function AdminHome() {
  const db = supabaseAdmin();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400 * 1000).toISOString();

  const [
    activeMembers,
    pastDue,
    dropinsToday,
    entriesToday,
    openAlerts,
    newMembersMonth,
    cancelledMonth,
    cancelledPrevMonth,
    newMembersPrevMonth,
    dropinsMonth,
    activeMembershipsWithPlan,
    recentDropinsPaid,
    recentEntries,
  ] = await Promise.all([
    db.from('memberships').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    db.from('memberships').select('id', { count: 'exact', head: true }).eq('status', 'past_due'),
    db.from('dropins').select('id', { count: 'exact', head: true }).gte('created_at', today),
    db.from('entry_log').select('id', { count: 'exact', head: true }).gte('occurred_at', today),
    db.from('sharing_alerts').select('id', { count: 'exact', head: true }).eq('resolved', false),
    db.from('memberships').select('id', { count: 'exact', head: true }).gte('created_at', monthStart),
    db
      .from('memberships')
      .select('id', { count: 'exact', head: true })
      .gte('cancelled_at', monthStart)
      .in('status', ['cancelled', 'expired']),
    db
      .from('memberships')
      .select('id', { count: 'exact', head: true })
      .gte('cancelled_at', prevMonthStart)
      .lt('cancelled_at', monthStart)
      .in('status', ['cancelled', 'expired']),
    db
      .from('memberships')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', prevMonthStart)
      .lt('created_at', monthStart),
    db.from('dropins').select('amount_nok, status').gte('created_at', monthStart),
    db.from('memberships').select('plans(price_nok, interval)').eq('status', 'active'),
    db.from('dropins').select('amount_nok').eq('status', 'paid').gte('created_at', thirtyDaysAgo),
    db.from('entry_log').select('occurred_at').gte('occurred_at', thirtyDaysAgo),
  ]);

  // MRR from active memberships (normalize year → month)
  const mrrOre = (activeMembershipsWithPlan.data ?? []).reduce((sum, m) => {
    const p = m.plans as unknown as { price_nok: number; interval: string } | null;
    if (!p) return sum;
    return sum + (p.interval === 'year' ? Math.round(p.price_nok / 12) : p.price_nok);
  }, 0);

  // Drop-in revenue this month (paid only)
  const dropinRevenueMonthOre = (dropinsMonth.data ?? [])
    .filter((d) => d.status === 'paid')
    .reduce((s, d) => s + d.amount_nok, 0);

  // Drop-in revenue last 30d
  const dropinRevenue30dOre = (recentDropinsPaid.data ?? []).reduce((s, d) => s + d.amount_nok, 0);

  // Churn this month: cancelled / active at start of month (approx: active + cancelled)
  const activeCount = activeMembers.count ?? 0;
  const cancelledThisMonth = cancelledMonth.count ?? 0;
  const cancelledPrev = cancelledPrevMonth.count ?? 0;
  const churnBase = activeCount + cancelledThisMonth;
  const churnPct = churnBase > 0 ? (cancelledThisMonth / churnBase) * 100 : 0;

  // Entries per day (last 14 days) for sparkline
  const days: { label: string; count: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const next = new Date(d.getTime() + 86400 * 1000);
    const count = (recentEntries.data ?? []).filter((e) => {
      const t = new Date(e.occurred_at).getTime();
      return t >= d.getTime() && t < next.getTime();
    }).length;
    days.push({ label: d.toLocaleDateString('no-NO', { day: '2-digit', month: '2-digit' }), count });
  }
  const maxDay = Math.max(1, ...days.map((d) => d.count));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Oversikt</h1>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Aktive medlemmer" value={activeCount} />
        <Stat label="Forfalt betaling" value={pastDue.count ?? 0} />
        <Stat label="Drop-ins i dag" value={dropinsToday.count ?? 0} />
        <Stat label="Inngang i dag" value={entriesToday.count ?? 0} />
        <Stat label="MRR" value={`${formatKr(mrrOre)} kr`} />
        <Stat label="Drop-in-omsetning (mnd)" value={`${formatKr(dropinRevenueMonthOre)} kr`} />
        <Stat label="Nye medlemmer (mnd)" value={newMembersMonth.count ?? 0} sub={`Forrige: ${newMembersPrevMonth.count ?? 0}`} />
        <Stat label="Churn (mnd)" value={`${churnPct.toFixed(1)}%`} sub={`${cancelledThisMonth} avsluttet · forrige ${cancelledPrev}`} />
        <Stat label="Åpne varsler" value={openAlerts.count ?? 0} />
        <Stat label="Drop-in-omsetning (30d)" value={`${formatKr(dropinRevenue30dOre)} kr`} />
      </div>

      <section className="rounded-xl border bg-white p-4">
        <h2 className="mb-3 font-semibold">Inngang siste 14 dager</h2>
        <div className="flex items-end gap-1 h-32">
          {days.map((d) => (
            <div key={d.label} className="flex flex-1 flex-col items-center gap-1">
              <div
                className="w-full rounded-t bg-brand"
                style={{ height: `${(d.count / maxDay) * 100}%`, minHeight: d.count > 0 ? '4px' : '1px' }}
                title={`${d.label}: ${d.count}`}
              />
              <div className="text-[10px] text-neutral-500">{d.label}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function formatKr(ore: number) {
  return Math.round(ore / 100).toLocaleString('no-NO');
}

function Stat({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
      {sub && <div className="mt-1 text-[10px] text-neutral-400">{sub}</div>}
    </div>
  );
}
