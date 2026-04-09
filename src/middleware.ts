import createIntlMiddleware from 'next-intl/middleware';
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { locales, defaultLocale } from './i18n';
import { env } from './lib/env';

const intlMiddleware = createIntlMiddleware({
  locales,
  defaultLocale,
  localePrefix: 'as-needed',
  localeDetection: false,
});

export async function middleware(req: NextRequest) {
  // 1. Run next-intl first (handles locale routing).
  const res = intlMiddleware(req);

  // 2. Refresh the Supabase auth cookies on every request so the session stays alive.
  if (env.supabase.url && env.supabase.anonKey) {
    const supabase = createServerClient(env.supabase.url, env.supabase.anonKey, {
      cookies: {
        get(name: string) {
          return req.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: Record<string, unknown>) {
          res.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: Record<string, unknown>) {
          res.cookies.set({ name, value: '', ...options });
        },
      },
    });
    await supabase.auth.getUser();
  }

  // 3. Protect /membership: must be logged in.
  const path = req.nextUrl.pathname.replace(/^\/(no|en)/, '');
  if (path.startsWith('/membership')) {
    const token = req.cookies.get('sb-access-token')?.value
      ?? req.cookies.getAll().find((c) => c.name.startsWith('sb-') && c.name.endsWith('-auth-token'))?.value;
    if (!token) {
      const url = req.nextUrl.clone();
      url.pathname = '/login';
      return NextResponse.redirect(url);
    }
  }

  return res;
}

export const config = {
  matcher: ['/', '/((?!admin|api|mock|_next|.*\\..*).*)'],
};
