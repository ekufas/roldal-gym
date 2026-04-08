import type { SaltoClient, SaltoUser } from './types';

const users = new Map<string, SaltoUser>();
const groupMembers = new Map<string, Set<string>>();

function log(...args: unknown[]) {
  if (process.env.NODE_ENV !== 'test') console.log('[SaltoMock]', ...args);
}

export const mockSaltoClient: SaltoClient = {
  async createUser({ firstName, lastName, pin }) {
    const id = `mock-${crypto.randomUUID()}`;
    const u: SaltoUser = { id, firstName, lastName, enabled: true, pin };
    users.set(id, u);
    log('createUser', u);
    return u;
  },
  async setPin(userId, pin) {
    const u = users.get(userId);
    if (u) u.pin = pin;
    log('setPin', userId, pin);
  },
  async addToAccessGroup(userId, accessGroupId) {
    if (!groupMembers.has(accessGroupId)) groupMembers.set(accessGroupId, new Set());
    groupMembers.get(accessGroupId)!.add(userId);
    log('addToAccessGroup', userId, accessGroupId);
  },
  async removeFromAccessGroup(userId, accessGroupId) {
    groupMembers.get(accessGroupId)?.delete(userId);
    log('removeFromAccessGroup', userId, accessGroupId);
  },
  async disableUser(userId) {
    const u = users.get(userId);
    if (u) u.enabled = false;
    log('disableUser', userId);
  },
  async remoteUnlock(lockId) {
    log('remoteUnlock', lockId, '— DOOR OPEN (mock)');
  },
};
