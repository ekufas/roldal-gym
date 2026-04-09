import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import LoginClient from './login-client';

export const dynamic = 'force-dynamic';

export default async function LoginPage({ searchParams }: { searchParams: { next?: string } }) {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (user) redirect(searchParams.next || '/membership');
  return <LoginClient />;
}
