'use client';
import { Suspense, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function LoginClient() {
  return <Suspense><LoginInner /></Suspense>;
}

function LoginInner() {
  const t = useTranslations();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') ?? '/membership';
  const supabase = createClient();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<'phone' | 'code'>('phone');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function sendOtp() {
    setBusy(true); setError('');
    const normalized = normalize(phone);
    const check = await fetch('/api/auth/can-send-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: normalized }),
    }).then((r) => r.json());
    if (!check.ok) {
      setBusy(false);
      if (check.reason === 'cooldown') {
        setError(t('errors.otpCooldown', { seconds: check.retryInSeconds ?? 60 }));
        setStage('code');
      } else if (check.reason === 'daily_limit') {
        setError(t('errors.otpDailyLimit'));
      } else {
        setError('Error');
      }
      return;
    }
    const { error } = await supabase.auth.signInWithOtp({ phone: normalized });
    setBusy(false);
    if (error) setError(error.message);
    else setStage('code');
  }

  async function verifyOtp() {
    setBusy(true); setError('');
    const { error } = await supabase.auth.verifyOtp({
      phone: normalize(phone),
      token: code,
      type: 'sms',
    });
    setBusy(false);
    if (error) { setError(error.message); return; }
    await fetch('/api/auth/ensure-user', { method: 'POST' });
    router.push(next);
    router.refresh();
  }

  return (
    <div className="space-y-4 pt-12">
      <h1 className="text-2xl font-bold">{t('login.title')}</h1>
      {stage === 'phone' ? (
        <>
          <input
            className="w-full rounded-lg border p-3"
            placeholder={t('login.phonePlaceholder')}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <button
            onClick={sendOtp}
            disabled={busy || phone.length < 8}
            className="w-full rounded-xl bg-brand px-4 py-3 font-semibold text-white disabled:opacity-50"
          >
            {busy ? t('login.sending') : t('login.sendCode')}
          </button>
        </>
      ) : (
        <>
          <input
            className="w-full rounded-lg border p-3 text-center font-mono text-2xl tracking-widest"
            placeholder="000000"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            inputMode="numeric"
            maxLength={6}
          />
          <button
            onClick={verifyOtp}
            disabled={busy || code.length < 6}
            className="w-full rounded-xl bg-brand px-4 py-3 font-semibold text-white disabled:opacity-50"
          >
            {busy ? t('login.verifying') : t('login.verify')}
          </button>
          <button onClick={() => setStage('phone')} className="w-full text-sm text-neutral-500">
            {t('login.changePhone')}
          </button>
        </>
      )}
      {error && <div className="text-sm text-red-600">{error}</div>}
    </div>
  );
}

function normalize(p: string) {
  const trimmed = p.replace(/\s+/g, '');
  return trimmed.startsWith('+') ? trimmed : `+47${trimmed}`;
}
