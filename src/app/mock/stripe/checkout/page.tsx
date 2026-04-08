'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

export default function StripeMock() {
  const params = useSearchParams();
  const router = useRouter();
  const sessionId = params.get('session') ?? '';
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    // The mock id encodes the type: mock-sub-* for subscriptions, mock-cs-* for checkout.
    const mode = sessionId.startsWith('mock-sub-') ? 'subscription' : 'payment';
    await fetch('/api/webhooks/stripe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'checkout.session.completed',
        data: { object: { id: sessionId, mode } },
      }),
    });
    router.push(mode === 'subscription' ? '/membership?welcome=1' : '/dropin?paid=1');
  }

  return (
    <div className="mx-auto max-w-md space-y-4 p-6 text-center">
      <h1 className="text-xl font-bold">Stripe (mock) — Card payment</h1>
      <p className="text-sm text-neutral-600">Session: <code>{sessionId}</code></p>
      <button
        onClick={confirm}
        disabled={busy}
        className="rounded-xl bg-brand px-6 py-3 font-semibold text-white disabled:opacity-50"
      >
        {busy ? 'Processing...' : 'Confirm payment'}
      </button>
    </div>
  );
}
