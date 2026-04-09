'use client';
import { useState } from 'react';

export default function ReactivateButton({ label }: { label: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const res = await fetch('/api/membership/reactivate', { method: 'POST' });
          const data = await res.json();
          if (data.redirectUrl) window.location.href = data.redirectUrl;
          else setBusy(false);
        } catch {
          setBusy(false);
        }
      }}
      className="mt-3 rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
    >
      {busy ? '…' : label}
    </button>
  );
}
