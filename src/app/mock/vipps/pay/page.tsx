'use client';
export const dynamic = 'force-dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

export default function VippsPayMock() {
  return <Suspense><Inner /></Suspense>;
}

function Inner() {
  const params = useSearchParams();
  const router = useRouter();
  const paymentId = params.get('paymentId') ?? '';
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    await fetch('/api/webhooks/vipps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventName: 'PAYMENT.CAPTURED', paymentId }),
    });
    router.push('/dropin?paid=1');
  }

  return (
    <div className="mx-auto max-w-md space-y-4 p-6 text-center">
      <h1 className="text-xl font-bold">Vipps (mock) — Drop-in</h1>
      <p className="text-sm text-neutral-600">Betalings-ID: <code>{paymentId}</code></p>
      <button
        onClick={confirm}
        disabled={busy}
        className="rounded-xl bg-brand px-6 py-3 font-semibold text-white disabled:opacity-50"
      >
        {busy ? 'Behandler...' : 'Bekreft betaling'}
      </button>
    </div>
  );
}
