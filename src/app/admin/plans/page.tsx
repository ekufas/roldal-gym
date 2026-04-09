import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

async function savePlan(formData: FormData) {
  'use server';
  const db = supabaseAdmin();
  const id = (formData.get('id') as string) || null;
  const name = String(formData.get('name') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim() || null;
  const priceKr = Number(formData.get('price_kr') ?? 0);
  const interval = String(formData.get('interval') ?? 'month');
  const active = formData.get('active') === 'on';
  if (!name || priceKr <= 0) return;
  const row = {
    name,
    description,
    price_nok: Math.round(priceKr * 100),
    interval,
    active,
  };
  if (id) {
    await db.from('plans').update(row).eq('id', id);
  } else {
    await db.from('plans').insert(row);
  }
  revalidatePath('/admin/plans');
}

async function deletePlan(formData: FormData) {
  'use server';
  const id = String(formData.get('id') ?? '');
  if (!id) return;
  const db = supabaseAdmin();
  await db.from('plans').delete().eq('id', id);
  revalidatePath('/admin/plans');
}

export default async function PlansAdminPage() {
  const db = supabaseAdmin();
  const { data: plans } = await db.from('plans').select('*').order('created_at', { ascending: true });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Planer</h1>

      <div className="space-y-3">
        {(plans ?? []).map((p) => (
          <form key={p.id} action={savePlan} className="rounded-xl border bg-white p-4">
            <input type="hidden" name="id" value={p.id} />
            <div className="grid grid-cols-1 gap-3 md:grid-cols-[2fr_2fr_1fr_1fr_auto_auto] md:items-end">
              <label className="text-xs text-neutral-500">
                Navn
                <input name="name" defaultValue={p.name} className="mt-1 w-full rounded border px-2 py-1 text-sm text-neutral-800" required />
              </label>
              <label className="text-xs text-neutral-500">
                Beskrivelse
                <input name="description" defaultValue={p.description ?? ''} className="mt-1 w-full rounded border px-2 py-1 text-sm text-neutral-800" />
              </label>
              <label className="text-xs text-neutral-500">
                Pris (kr)
                <input name="price_kr" type="number" min="1" step="1" defaultValue={Math.round(p.price_nok / 100)} className="mt-1 w-full rounded border px-2 py-1 text-sm text-neutral-800" required />
              </label>
              <label className="text-xs text-neutral-500">
                Intervall
                <select name="interval" defaultValue={p.interval} className="mt-1 w-full rounded border px-2 py-1 text-sm text-neutral-800">
                  <option value="month">Månedlig</option>
                  <option value="year">Årlig</option>
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm text-neutral-700">
                <input type="checkbox" name="active" defaultChecked={p.active} /> Aktiv
              </label>
              <button type="submit" className="rounded-xl bg-brand px-3 py-2 text-sm font-semibold text-white">
                Lagre
              </button>
            </div>
          </form>
        ))}
        {(!plans || plans.length === 0) && (
          <div className="rounded-xl border bg-white p-6 text-center text-sm text-neutral-400">Ingen planer ennå.</div>
        )}
      </div>

      <div className="rounded-xl border bg-white p-4">
        <h2 className="mb-3 font-semibold">Ny plan</h2>
        <form action={savePlan} className="grid grid-cols-1 gap-3 md:grid-cols-[2fr_2fr_1fr_1fr_auto_auto] md:items-end">
          <label className="text-xs text-neutral-500">
            Navn
            <input name="name" className="mt-1 w-full rounded border px-2 py-1 text-sm text-neutral-800" required />
          </label>
          <label className="text-xs text-neutral-500">
            Beskrivelse
            <input name="description" className="mt-1 w-full rounded border px-2 py-1 text-sm text-neutral-800" />
          </label>
          <label className="text-xs text-neutral-500">
            Pris (kr)
            <input name="price_kr" type="number" min="1" step="1" className="mt-1 w-full rounded border px-2 py-1 text-sm text-neutral-800" required />
          </label>
          <label className="text-xs text-neutral-500">
            Intervall
            <select name="interval" defaultValue="month" className="mt-1 w-full rounded border px-2 py-1 text-sm text-neutral-800">
              <option value="month">Månedlig</option>
              <option value="year">Årlig</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-neutral-700">
            <input type="checkbox" name="active" defaultChecked /> Aktiv
          </label>
          <button type="submit" className="rounded-xl bg-brand px-3 py-2 text-sm font-semibold text-white">
            Opprett
          </button>
        </form>
      </div>

      <div className="rounded-xl border bg-white p-4">
        <h2 className="mb-3 font-semibold text-red-700">Slett plan</h2>
        <p className="mb-3 text-xs text-neutral-500">Fjerner planen helt. Bruk &quot;Aktiv&quot; istedenfor hvis planen bare skal skjules.</p>
        <div className="space-y-2">
          {(plans ?? []).map((p) => (
            <form key={p.id} action={deletePlan} className="flex items-center gap-3">
              <input type="hidden" name="id" value={p.id} />
              <span className="flex-1 text-sm">{p.name}</span>
              <button type="submit" className="rounded border border-red-300 px-3 py-1 text-xs text-red-600">
                Slett
              </button>
            </form>
          ))}
        </div>
      </div>
    </div>
  );
}
