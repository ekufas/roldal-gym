// Vipps Recurring + ePayment client.
// Mock-first; real impl used when USE_MOCKS=false.
//
// Docs:
//   Access token: https://developer.vippsmobilepay.com/api/access-token
//   Recurring:    https://developer.vippsmobilepay.com/api/recurring
//   ePayment:     https://developer.vippsmobilepay.com/docs/APIs/epayment-api/

import { env } from '../env';

export interface VippsAgreement {
  agreementId: string;
  vippsConfirmationUrl: string;
}

export interface VippsPayment {
  paymentId: string;
  redirectUrl: string;
}

export interface VippsClient {
  createRecurringAgreement(input: {
    phone: string;
    amountNok: number;
    interval: 'MONTH' | 'YEAR';
    productName: string;
    callbackPrefix: string;
  }): Promise<VippsAgreement>;
  createOneOffPayment(input: {
    phone: string;
    amountNok: number;
    description: string;
    callbackPrefix: string;
  }): Promise<VippsPayment>;
  createCharge(input: {
    agreementId: string;
    amountNok: number;
    description: string;
  }): Promise<{ chargeId: string }>;
  stopAgreement(agreementId: string): Promise<void>;
}

const mockClient: VippsClient = {
  async createRecurringAgreement({ productName }) {
    const id = `mock-agr-${crypto.randomUUID()}`;
    console.log('[VippsMock] createRecurringAgreement', productName, '→', id);
    return { agreementId: id, vippsConfirmationUrl: `${env.appUrl}/mock/vipps/confirm?agreementId=${id}` };
  },
  async createOneOffPayment({ description }) {
    const id = `mock-pay-${crypto.randomUUID()}`;
    console.log('[VippsMock] createOneOffPayment', description, '→', id);
    return { paymentId: id, redirectUrl: `${env.appUrl}/mock/vipps/pay?paymentId=${id}` };
  },
  async createCharge({ agreementId, amountNok, description }) {
    const chargeId = `mock-charge-${crypto.randomUUID()}`;
    console.log('[VippsMock] createCharge', agreementId, amountNok, description, '→', chargeId);
    return { chargeId };
  },
  async stopAgreement(agreementId) {
    console.log('[VippsMock] stopAgreement', agreementId);
  },
};

// --- Real client ---

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken.value;
  const res = await fetch(`${env.vipps.apiBase}/accesstoken/get`, {
    method: 'POST',
    headers: {
      'client_id': env.vipps.clientId,
      'client_secret': env.vipps.clientSecret,
      'Ocp-Apim-Subscription-Key': env.vipps.subscriptionKey,
      'Merchant-Serial-Number': env.vipps.msn,
    },
  });
  if (!res.ok) throw new Error(`Vipps accesstoken failed: ${res.status} ${await res.text()}`);
  const data = await res.json() as { access_token: string; expires_in: string };
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + Number(data.expires_in) * 1000,
  };
  return cachedToken.value;
}

function normalisePhone(p: string): string {
  // Vipps wants MSISDN without the + prefix, e.g. 4799999999
  return p.replace(/^\+/, '').replace(/\s+/g, '');
}

function commonHeaders(token: string) {
  return {
    'Authorization': `Bearer ${token}`,
    'Ocp-Apim-Subscription-Key': env.vipps.subscriptionKey,
    'Merchant-Serial-Number': env.vipps.msn,
    'Vipps-System-Name': 'roldal-gym',
    'Vipps-System-Version': '1.0.0',
    'Vipps-System-Plugin-Name': 'roldal-gym-app',
    'Vipps-System-Plugin-Version': '1.0.0',
    'Content-Type': 'application/json',
  };
}

const realClient: VippsClient = {
  async createRecurringAgreement({ phone, amountNok, interval, productName, callbackPrefix }) {
    const token = await getAccessToken();
    const idempotencyKey = crypto.randomUUID();
    const body = {
      pricing: { type: 'LEGACY', amount: amountNok * 100, currency: 'NOK' },
      interval: { unit: interval, count: 1 },
      merchantRedirectUrl: `${env.appUrl}/membership?welcome=1`,
      merchantAgreementUrl: `${env.appUrl}/membership`,
      phoneNumber: normalisePhone(phone),
      productName,
      productDescription: productName,
      scope: 'address name email phoneNumber',
    };
    const res = await fetch(`${env.vipps.apiBase}/recurring/v3/agreements`, {
      method: 'POST',
      headers: { ...commonHeaders(token), 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Vipps createAgreement failed: ${res.status} ${await res.text()}`);
    const data = await res.json() as { agreementId: string; vippsConfirmationUrl: string };
    console.log('[Vipps] createRecurringAgreement →', data.agreementId);
    return { agreementId: data.agreementId, vippsConfirmationUrl: data.vippsConfirmationUrl };
  },

  async createOneOffPayment({ phone, amountNok, description, callbackPrefix }) {
    const token = await getAccessToken();
    const reference = `dropin-${crypto.randomUUID()}`;
    const body = {
      amount: { currency: 'NOK', value: amountNok * 100 },
      paymentMethod: { type: 'WALLET' },
      customer: { phoneNumber: normalisePhone(phone) },
      reference,
      returnUrl: `${env.appUrl}/dropin?paid=1`,
      userFlow: 'WEB_REDIRECT',
      paymentDescription: description,
    };
    const res = await fetch(`${env.vipps.apiBase}/epayment/v1/payments`, {
      method: 'POST',
      headers: {
        ...commonHeaders(token),
        'Idempotency-Key': reference,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Vipps createPayment failed: ${res.status} ${await res.text()}`);
    const data = await res.json() as { reference: string; redirectUrl: string };
    console.log('[Vipps] createOneOffPayment →', data.reference);
    return { paymentId: data.reference, redirectUrl: data.redirectUrl };
  },

  async createCharge({ agreementId, amountNok, description }) {
    const token = await getAccessToken();
    const idempotencyKey = crypto.randomUUID();
    const due = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    const body = {
      amount: amountNok * 100,
      description,
      due: due.toISOString(),
      retryDays: 3,
      transactionType: 'DIRECT_CAPTURE',
    };
    const res = await fetch(`${env.vipps.apiBase}/recurring/v3/agreements/${agreementId}/charges`, {
      method: 'POST',
      headers: { ...commonHeaders(token), 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Vipps createCharge failed: ${res.status} ${await res.text()}`);
    const data = await res.json() as { chargeId: string };
    console.log('[Vipps] createCharge', agreementId, '→', data.chargeId);
    return { chargeId: data.chargeId };
  },

  async stopAgreement(agreementId) {
    const token = await getAccessToken();
    const res = await fetch(`${env.vipps.apiBase}/recurring/v3/agreements/${agreementId}`, {
      method: 'PATCH',
      headers: commonHeaders(token),
      body: JSON.stringify({ status: 'STOPPED' }),
    });
    if (!res.ok) {
      console.error(`Vipps stopAgreement failed: ${res.status} ${await res.text()}`);
    }
  },
};

// Per-client override: set VIPPS_USE_MOCK=false to use the real Vipps test env
// even while the rest of the app stays on USE_MOCKS=true.
const useMock = process.env.VIPPS_USE_MOCK !== undefined
  ? process.env.VIPPS_USE_MOCK !== 'false'
  : env.useMocks;

export const vipps: VippsClient = useMock ? mockClient : realClient;
