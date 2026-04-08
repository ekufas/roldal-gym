'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';

export default function DropinPage() {
  const t = useTranslations();
  const params = useSearchParams();
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    if (params.get('paid') === '1') setDone('');
  }, [params]);

  async function pay(provider: 'vipps' | 'stripe') {
    setBusy(true);
    const res = await fetch('/api/dropin/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, provider }),
    });
    const data = await res.json();
    if (data.redirectUrl) window.location.href = data.redirectUrl;
    else if (data.success) setDone(phone);
    else { setBusy(false); alert(data.error ?? 'Error'); }
  }

  if (done !== null) {
    return (
      <div className="space-y-4 pt-12 text-center">
        <div className="text-3xl">✓</div>
        <h1 className="text-2xl font-bold text-brand">Betaling mottatt</h1>
        <p className="text-neutral-600">
          Du får en SMS med en engangskode du kan taste på tastaturet ved døra. Koden er gyldig i 4 timer.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 pt-6">
      <h1 className="text-2xl font-bold">{t('dropin.title')}</h1>
      <p className="text-neutral-600">{t('dropin.subtitle')}</p>
      <input className="w-full rounded-lg border p-3" placeholder={t('dropin.phone')} value={phone} onChange={(e) => setPhone(e.target.value)} />
      <button disabled={busy || !phone} onClick={() => pay('vipps')} className="w-full rounded-xl bg-brand px-4 py-3 font-semibold text-white disabled:opacity-50">
        {t('dropin.payVipps')}
      </button>
      <button disabled={busy || !phone} onClick={() => pay('stripe')} className="w-full rounded-xl border border-brand px-4 py-3 font-semibold text-brand disabled:opacity-50">
        {t('dropin.payCard')}
      </button>
    </div>
  );
}
