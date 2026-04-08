import type { SaltoClient } from './types';
import { env } from '../env';

// Real Salto KS Connect API client.
// TODO: implement once SALTO_CLIENT_ID / SECRET are received from local Salto Business Unit.
// Auth: OAuth 2.0 client credentials. Base URL provided by Salto.
// Endpoints used:
//   POST /v1.1/sites/{siteId}/users
//   PUT  /v1.1/sites/{siteId}/users/{userId}/pin
//   POST /v1.1/sites/{siteId}/accessgroups/{groupId}/users
//   DELETE /v1.1/sites/{siteId}/accessgroups/{groupId}/users/{userId}
//   POST /v1.1/sites/{siteId}/locks/{lockId}/openlock
//
// Docs: https://developer.saltosystems.com/ks/connect-api/

async function token(): Promise<string> {
  // TODO: cache & refresh
  const res = await fetch(`${env.salto.apiBase}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: env.salto.clientId,
      client_secret: env.salto.clientSecret,
    }),
  });
  if (!res.ok) throw new Error(`Salto auth failed: ${res.status}`);
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

async function authed(path: string, init: RequestInit = {}) {
  const t = await token();
  const res = await fetch(`${env.salto.apiBase}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${t}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) throw new Error(`Salto ${init.method ?? 'GET'} ${path} → ${res.status}`);
  return res;
}

export const realSaltoClient: SaltoClient = {
  async createUser({ firstName, lastName, pin }) {
    const res = await authed(`/v1.1/sites/${env.salto.siteId}/users`, {
      method: 'POST',
      body: JSON.stringify({ firstName, lastName, pinCode: pin }),
    });
    const data = (await res.json()) as { id: string };
    return { id: data.id, firstName, lastName, enabled: true, pin };
  },
  async setPin(userId, pin) {
    await authed(`/v1.1/sites/${env.salto.siteId}/users/${userId}/pin`, {
      method: 'PUT',
      body: JSON.stringify({ pinCode: pin }),
    });
  },
  async addToAccessGroup(userId, accessGroupId) {
    await authed(`/v1.1/sites/${env.salto.siteId}/accessgroups/${accessGroupId}/users`, {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
  },
  async removeFromAccessGroup(userId, accessGroupId) {
    await authed(`/v1.1/sites/${env.salto.siteId}/accessgroups/${accessGroupId}/users/${userId}`, {
      method: 'DELETE',
    });
  },
  async disableUser(userId) {
    await authed(`/v1.1/sites/${env.salto.siteId}/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled: false }),
    });
  },
  async remoteUnlock(lockId) {
    await authed(`/v1.1/sites/${env.salto.siteId}/locks/${lockId}/openlock`, { method: 'POST' });
  },
};
