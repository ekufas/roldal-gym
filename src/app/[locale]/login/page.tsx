'use client';
export const dynamic = 'force-dynamic';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<'phone' | 'code'>('phone');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function sendOtp() {
    setBusy(true); setError('');
    const { error } = await supabase.auth.signInWithOtp({ phone: normalize(phone) });
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
    router.push('/membership');
    router.refresh();
  }

  return (
    <div className="space-y-4 pt-12">
      <h1 className="text-2xl font-bold">Logg inn</h1>
      {stage === 'phone' ? (
        <>
          <input
            className="w-full rounded-lg border p-3"
            placeholder="Telefonnummer (f.eks. +4799999999)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <button
            onClick={sendOtp}
            disabled={busy || phone.length < 8}
            className="w-full rounded-xl bg-brand px-4 py-3 font-semibold text-white disabled:opacity-50"
          >
            {busy ? 'Sender...' : 'Send SMS-kode'}
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
            {busy ? 'Bekrefter...' : 'Bekreft'}
          </button>
          <button onClick={() => setStage('phone')} className="w-full text-sm text-neutral-500">
            Endre telefonnummer
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
