'use client';
import { usePathname, useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';

export default function LanguageSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  function switchTo(next: 'no' | 'en') {
    if (next === locale) return;
    // Persist explicit choice so next-intl's auto-detection doesn't override it next visit.
    document.cookie = `NEXT_LOCALE=${next}; path=/; max-age=31536000; samesite=lax`;
    const stripped = pathname.replace(/^\/(no|en)(?=\/|$)/, '') || '/';
    const target = next === 'no' ? stripped : `/en${stripped === '/' ? '' : stripped}`;
    router.push(target);
    router.refresh();
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
