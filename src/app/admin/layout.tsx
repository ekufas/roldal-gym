import type { ReactNode } from 'react';
import Link from 'next/link';
import '../globals.css';

export const metadata = { title: 'Røldal Gym — Admin' };

export default function AdminLayout({ children }: { children: ReactNode }) {
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
