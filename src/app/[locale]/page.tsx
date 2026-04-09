import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { supabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function LandingPage() {
  const t = await getTranslations();
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();

  return (
    <div className="space-y-6 pt-12 text-center">
      <h1 className="text-3xl font-bold text-brand">{t('landing.title')}</h1>
      <p className="text-neutral-600">{t('landing.subtitle')}</p>
      <div className="flex flex-col gap-3 pt-4">
        {user ? (
          <Link href="/membership" className="rounded-xl bg-brand px-6 py-3 font-semibold text-white">
            {t('landing.goToMembership')}
          </Link>
        ) : (
          <>
            <Link href="/plans" className="rounded-xl bg-brand px-6 py-3 font-semibold text-white">
              {t('landing.ctaMember')}
            </Link>
            <Link href="/dropin" className="rounded-xl border border-brand px-6 py-3 font-semibold text-brand">
              {t('landing.ctaDropin')}
            </Link>
          </>
        )}
      </div>
      <div className="pt-8 text-xs text-neutral-400">{t('brand.org')}</div>
    </div>
  );
}
