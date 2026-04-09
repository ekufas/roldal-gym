'use client';
import { Suspense, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Stage = 'form' | 'code' | 'pay';

type Props = { initialStage?: Stage; initialName?: string; initialPhone?: string; initialEmail?: string };

export default function SignupClient(props: Props) {
  return <Suspense><SignupInner {...props} /></Suspense>;
}

function SignupInner({ initialStage = 'form', initialName = '', initialPhone = '', initialEmail = '' }: Props) {
  const t = useTranslations();
  const params = useSearchParams();
  const supabase = createClient();
  const planId = params.get('plan') ?? 'standard';
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone);
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<Stage>(initialStage);
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
    if (error) { setBusy(false); setError(error.message); return; }
    await fetch('/api/auth/ensure-user', { method: 'POST' });
    setBusy(false);
    setStage('pay');
  }

  async function start(provider: 'vipps' | 'stripe') {
    setBusy(true); setError('');
    const res = await fetch('/api/membership/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planId, name, phone: normalize(phone), email, provider }),
    });
    const data = await res.json();
    if (data.redirectUrl) window.location.href = data.redirectUrl;
    else { setBusy(false); setError(data.error ?? 'Error'); }
  }

  return (
    <div className="space-y-4 pt-6">
      <h1 className="text-2xl font-bold">{t('signup.title')}</h1>

      {stage === 'form' && (
        <>
          <input className="w-full rounded-lg border p-3" placeholder={t('signup.name')} value={name} onChange={(e) => setName(e.target.value)} />
          <input className="w-full rounded-lg border p-3" placeholder={t('signup.phone')} value={phone} onChange={(e) => setPhone(e.target.value)} />
          <input className="w-full rounded-lg border p-3" placeholder={t('signup.email')} value={email} onChange={(e) => setEmail(e.target.value)} />
          <button disabled={busy || !name || phone.length < 8} onClick={sendOtp} className="w-full rounded-xl bg-brand px-4 py-3 font-semibold text-white disabled:opacity-50">
            {busy ? t('signup.sending') : t('signup.sendCode')}
          </button>
        </>
      )}

      {stage === 'code' && (
        <>
          <p className="text-sm text-neutral-600">{t('signup.codeSentTo', { phone: normalize(phone) })}</p>
          <input
            className="w-full rounded-lg border p-3 text-center font-mono text-2xl tracking-widest"
            placeholder="000000"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            inputMode="numeric"
            maxLength={6}
          />
          <button disabled={busy || code.length < 6} onClick={verifyOtp} className="w-full rounded-xl bg-brand px-4 py-3 font-semibold text-white disabled:opacity-50">
            {busy ? t('signup.verifying') : t('signup.verifyCode')}
          </button>
          <button onClick={() => setStage('form')} className="w-full text-sm text-neutral-500">{t('signup.back')}</button>
        </>
      )}

      {stage === 'pay' && (
        <>
          <p className="text-sm text-neutral-600">{t('signup.phoneConfirmed')}</p>
          <button disabled={busy} onClick={() => start('vipps')} className="w-full rounded-xl bg-brand px-4 py-3 font-semibold text-white disabled:opacity-50">
            {t('signup.payVipps')}
          </button>
          <button disabled={busy} onClick={() => start('stripe')} className="w-full rounded-xl border border-brand px-4 py-3 font-semibold text-brand disabled:opacity-50">
            {t('signup.payCard')}
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
