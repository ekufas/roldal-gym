import { env } from './env';

export interface SmsClient {
  send(to: string, message: string): Promise<void>;
}

const mockClient: SmsClient = {
  async send(to, message) {
    console.log(`[SMSMock] → ${to}: ${message}`);
  },
};

// Sveve HTTP API — https://sveve.no/apidok/
// GET https://sveve.no/SMS/SendMessage?user=...&passwd=...&to=...&msg=...&from=...
const sveveClient: SmsClient = {
  async send(to, message) {
    const params = new URLSearchParams({
      user: process.env.SVEVE_USER ?? '',
      passwd: process.env.SVEVE_PASSWORD ?? '',
      to: to.replace(/^\+/, ''),
      msg: message,
      from: env.sms.sender,
      f: 'json',
    });
    const url = `https://sveve.no/SMS/SendMessage?${params.toString()}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Sveve send failed: ${res.status} ${await res.text()}`);
    }
    const data = await res.json().catch(() => ({}));
    console.log('[Sveve]', to, '→', data);
  },
};

export const sms: SmsClient = (() => {
  switch (env.sms.provider) {
    case 'sveve': return sveveClient;
    case 'mock':
    default:      return mockClient;
  }
})();
