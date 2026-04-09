'use client';
import { usePathname, useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';

export default function LanguageSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  function switchTo(next: 'no' | 'en') {
    if (next === locale) return;
    // Strip current locale prefix if present, then add new one (except for default 'no').
    const stripped = pathname.replace(/^\/(no|en)(?=\/|$)/, '') || '/';
    const target = next === 'no' ? stripped : `/en${stripped === '/' ? '' : stripped}`;
    router.push(target);
  }

  return (
    <div className="text-xs text-neutral-500">
      <button
        onClick={() => switchTo('no')}
        className={locale === 'no' ? 'font-semibold text-brand' : 'hover:underline'}
      >
        NO
      </button>
      <span className="mx-1">·</span>
      <button
        onClick={() => switchTo('en')}
        className={locale === 'en' ? 'font-semibold text-brand' : 'hover:underline'}
      >
        EN
      </button>
    </div>
  );
}
