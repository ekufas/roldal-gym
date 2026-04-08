'use client';
export const dynamic = 'force-dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

export default function VippsConfirmMock() {
  return <Suspense><Inner /></Suspense>;
}

function Inner() {
  const params = useSearchParams();
  const router = useRouter();
  const agreementId = params.get('agreementId') ?? '';
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    await fetch('/api/webhooks/vipps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventName: 'AGREEMENT.ACCEPTED', agreementId }),
    });
    router.push('/membership?welcome=1');
  }

  return (
    <div className="mx-auto max-w-md space-y-4 p-6 text-center">
      <h1 className="text-xl font-bold">Vipps (mock) — Godkjenn avtale</h1>
      <p className="text-sm text-neutral-600">
        Simulert Vipps-bekreftelse. Avtale-ID: <code>{agreementId}</code>
      </p>
      <button
        onClick={confirm}
        disabled={busy}
        className="rounded-xl bg-brand px-6 py-3 font-semibold text-white disabled:opacity-50"
      >
        {busy ? 'Bekrefter...' : 'Godkjenn og fortsett'}
      </button>
      <div className="pt-4 text-xs text-neutral-400">
        Erstattes med ekte Vipps-flyt når API-nøkler er aktivert.
      </div>
    </div>
  );
}
