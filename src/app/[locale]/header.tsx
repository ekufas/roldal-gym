import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { supabaseServer, supabaseAdmin } from '@/lib/supabase/server';
import LanguageSwitcher from './language-switcher';

export default async function Header() {
  const t = await getTranslations();
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();

  let name: string | null = null;
  if (user) {
    const db = supabaseAdmin();
    const { data: profile } = await db
      .from('users')
      .select('name')
      .eq('auth_id', user.id)
      .maybeSingle();
    name = profile?.name ?? null;
  }

  return (
    <div className="mb-4 flex items-center justify-between border-b pb-2">
      <Link href="/" className="font-bold text-brand">
        Røldal Gym
      </Link>
      <div className="flex items-center gap-3 text-xs">
        {user ? (
          <>
            <span className="text-neutral-500">
              {t('header.greeting', { name: name ?? '' })}
            </span>
            <Link href="/membership" className="font-semibold text-brand hover:underline">
              {t('header.myMembership')}
            </Link>
          </>
        ) : (
          <Link href="/login" className="font-semibold text-brand hover:underline">
            {t('header.login')}
          </Link>
        )}
        <LanguageSwitcher />
      </div>
    </div>
  );
}
