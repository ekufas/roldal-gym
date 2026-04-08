// Server-side Supabase clients.
//
// Two flavours:
//   - supabaseServer()  : per-request client bound to the user's auth cookies.
//                          Use in server components, server actions, and route handlers
//                          when you need to act AS the logged-in user (RLS applies).
//   - supabaseAdmin()   : service-role client. BYPASSES RLS. Use only in webhooks,
//                          cron jobs, and other server code that must read/write any row.

import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { env } from '../env';

export function supabaseServer() {
  const cookieStore = cookies();
  return createServerClient(env.supabase.url, env.supabase.anonKey, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options) {
        try {
          cookieStore.set({ name, value, ...options });
        } catch {
          // called from a server component – ignore (middleware will refresh)
        }
      },
      remove(name: string, options) {
        try {
          cookieStore.set({ name, value: '', ...options });
        } catch {
          // ignore
        }
      },
    },
  });
}

export function supabaseAdmin() {
  if (!env.supabase.url || !env.supabase.serviceRoleKey) {
    return new Proxy({}, {
      get() {
        throw new Error('Supabase service role not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
      },
    }) as ReturnType<typeof createClient>;
  }
  return createClient(env.supabase.url, env.supabase.serviceRoleKey, {
    auth: { persistSession: false },
  });
}
