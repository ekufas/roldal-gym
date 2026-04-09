import type { ReactNode } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { supabaseServer, supabaseAdmin } from '@/lib/supabase/server';
import '../globals.css';

export const metadata = { title: 'Røldal Gym — Admin' };
export const dynamic = 'force-dynamic';

async function requireAdmin() {
  const sb = supabaseServer();
  const { data: { user: authUser } } = await sb.auth.getUser();
  if (!authUser) redirect('/login?next=/admin');
  const db = supabaseAdmin();
  const { data: profile } = await db
    .from('users')
    .select('is_admin')
    .eq('auth_id', authUser.id)
    .maybeSingle();
  if (!profile?.is_admin) {
    return { authorized: false as const };
  }
  return { authorized: true as const };
}

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const gate = await requireAdmin();
  if (!gate.authorized) {
    return (
      <html lang="no">
        <body>
          <div className="mx-auto max-w-md p-12 text-center">
            <h1 className="text-2xl font-bold">Ingen tilgang</h1>
            <p className="mt-2 text-neutral-600">Denne siden er kun for administratorer.</p>
          </div>
        </body>
      </html>
    );
  }
  return (
    <html lang="no">
      <body>
        <div className="flex min-h-screen">
          <aside className="w-56 border-r bg-white p-4">
            <div className="mb-6 font-bold text-brand">Røldal Gym Admin</div>
            <nav className="flex flex-col gap-2 text-sm">
              <Link href="/admin">Oversikt</Link>
              <Link href="/admin/members">Medlemmer</Link>
              <Link href="/admin/dropins">Drop-ins</Link>
              <Link href="/admin/entries">Inngangslogg</Link>
              <Link href="/admin/alerts">Varsler</Link>
              <Link href="/admin/plans">Planer</Link>
            </nav>
          </aside>
          <main className="flex-1 p-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
