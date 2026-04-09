import { supabaseServer, supabaseAdmin } from '@/lib/supabase/server';
import SignupClient from './signup-client';

export const dynamic = 'force-dynamic';

export default async function SignupPage() {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return <SignupClient />;

  // Already logged in — skip the OTP stages entirely (no SMS).
  const db = supabaseAdmin();
  const { data: profile } = await db
    .from('users')
    .select('name, phone, email')
    .eq('auth_id', user.id)
    .maybeSingle();

  return (
    <SignupClient
      initialStage="pay"
      initialName={profile?.name ?? ''}
      initialPhone={profile?.phone ?? ''}
      initialEmail={profile?.email ?? ''}
    />
  );
}
