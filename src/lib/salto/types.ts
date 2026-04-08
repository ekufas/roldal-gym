// Types modeled after Salto KS Connect API concepts.
// See: https://developer.saltosystems.com/ks/connect-api/

export interface SaltoUser {
  id: string;
  firstName: string;
  lastName: string;
  enabled: boolean;
  pin?: string;
}

export interface SaltoClient {
  createUser(input: { firstName: string; lastName: string; pin?: string }): Promise<SaltoUser>;
  setPin(userId: string, pin: string): Promise<void>;
  addToAccessGroup(userId: string, accessGroupId: string): Promise<void>;
  removeFromAccessGroup(userId: string, accessGroupId: string): Promise<void>;
  disableUser(userId: string): Promise<void>;
  remoteUnlock(lockId: string): Promise<void>;
}
