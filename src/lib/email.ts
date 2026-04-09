import { env } from './env';

type SendArgs = { to: string; subject: string; html: string; text?: string };

// Thin Resend client. If RESEND_API_KEY is missing we log and no-op so dev/mock still works.
export const email = {
  async send({ to, subject, html, text }: SendArgs) {
    if (!env.email.resendApiKey) {
      console.log('[email:mock]', { to, subject });
      return;
    }
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.email.resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: env.email.from, to, subject, html, text }),
    });
    if (!res.ok) {
      console.error('[email] resend failed', res.status, await res.text());
    }
  },
};

export function membershipReceiptHtml(opts: {
  name: string | null;
  planName: string;
  amountKr: number;
  interval: 'month' | 'year' | string;
  nextChargeDate: Date;
  provider: 'vipps' | 'stripe';
}) {
  const greeting = opts.name ? `Hei ${opts.name},` : 'Hei,';
  const intervalText = opts.interval === 'month' ? 'månedlig' : opts.interval === 'year' ? 'årlig' : opts.interval;
  return `
    <div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto;padding:24px;color:#222">
      <h1 style="color:#0b6e4f;margin:0 0 16px">Velkommen til Røldal Gym</h1>
      <p>${greeting}</p>
      <p>Takk for at du ble medlem! Medlemskapet ditt er nå aktivt.</p>
      <table style="border-collapse:collapse;width:100%;margin:16px 0">
        <tr><td style="padding:6px 0;color:#666">Plan</td><td style="padding:6px 0"><strong>${opts.planName}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#666">Pris</td><td style="padding:6px 0">${opts.amountKr} kr / ${intervalText}</td></tr>
        <tr><td style="padding:6px 0;color:#666">Betalingsmetode</td><td style="padding:6px 0">${opts.provider === 'vipps' ? 'Vipps' : 'Kort'}</td></tr>
        <tr><td style="padding:6px 0;color:#666">Neste trekk</td><td style="padding:6px 0">${opts.nextChargeDate.toLocaleDateString('no-NO')}</td></tr>
      </table>
      <p>Åpne døra og se din personlige tilgangskode på <a href="https://roldalgym.no/membership" style="color:#0b6e4f">Mitt medlemskap</a>.</p>
      <p style="color:#999;font-size:12px;margin-top:32px">Røldal Idrettslag · Denne e-posten er en kvittering og trenger ikke svar.</p>
    </div>
  `;
}
