import type { ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { locales } from '@/i18n';
import '../globals.css';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Røldal Gym',
  description: 'Medlemskap og drop-in for Røldal Gym',
};

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params: { locale },
}: {
  children: ReactNode;
  params: { locale: string };
}) {
  const messages = await getMessages();
  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <main className="mx-auto max-w-md p-4">{children}</main>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
