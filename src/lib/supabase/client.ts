// Browser-side Supabase client for use in client components.
'use client';

import { createBrowserClient } from '@supabase/ssr';
import { env } from '../env';

export function createClient() {
  return createBrowserClient(env.supabase.url, env.supabase.anonKey);
}
