'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';

export default function OpenDoorButton() {
  const t = useTranslations();
  const [status, setStatus] = useState<'idle' | 'opening' | 'opened' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  async function openDoor() {
    setStatus('opening');
    setErrorMsg('');
    if (!('geolocation' in navigator)) {
      setStatus('error');
      setErrorMsg(t('errors.outsideGeofence'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const res = await fetch('/api/unlock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
        });
        const data = await res.json();
        if (data.ok) setStatus('opened');
        else { setStatus('error'); setErrorMsg(mapError(data.error, t)); }
      },
      () => { setStatus('error'); setErrorMsg(t('errors.outsideGeofence')); },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  return (
    <>
      <button
        onClick={openDoor}
        disabled={status === 'opening'}
        className="w-full rounded-2xl bg-brand py-6 text-2xl font-bold text-white shadow-lg disabled:opacity-50"
      >
        {status === 'opening' ? t('membership.openingDoor') : t('membership.openDoor')}
      </button>
      {status === 'opened' && <div className="text-center text-brand">{t('membership.doorOpened')}</div>}
      {status === 'error' && <div className="text-center text-red-600">{errorMsg}</div>}
    </>
  );
}

function mapError(code: string | undefined, t: ReturnType<typeof useTranslations>) {
  if (code === 'outside_geofence') return t('errors.outsideGeofence');
  if (code === 'rate_limited') return t('errors.rateLimited');
  return code ?? 'Error';
}
