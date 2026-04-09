import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { supabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function PlansPage() {
  const t = await getTranslations();
  const supabase = supabaseServer();
  const { data: plans } = await supabase
    .from('plans')
    .select('id,name,description,price_nok,interval,active')
    .eq('active', true)
    .order('price_nok');

  return (
    <div className="space-y-6 pt-6">
      <h1 className="text-2xl font-bold">{t('plans.title')}</h1>
      <ul className="space-y-3">
        {(plans ?? []).map((p) => (
          <li key={p.id} className="rounded-xl border bg-white p-4">
            <div className="flex items-baseline justify-between">
              <div>
                <div className="font-semibold">{p.name}</div>
                {p.description && <div className="text-xs text-neutral-500">{p.description}</div>}
              </div>
              <div className="text-lg">
                {(p.price_nok / 100).toLocaleString('no-NO')} kr
                <span className="text-sm text-neutral-500">/{p.interval === 'month' ? t('plans.monthly') : t('plans.yearly')}</span>
              </div>
            </div>
            <Link
              href={`/signup?plan=${p.id}`}
              className="mt-3 inline-block rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white"
            >
              {t('plans.select')}
            </Link>
          </li>
        ))}
      </ul>
      <p className="text-sm text-neutral-500">{t('plans.foreignNote')}</p>
    </div>
  );
}
