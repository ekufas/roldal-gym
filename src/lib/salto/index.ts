import { env } from '../env';
import { mockSaltoClient } from './mock';
import { realSaltoClient } from './real';
import type { SaltoClient } from './types';

export const salto: SaltoClient = env.useMocks ? mockSaltoClient : realSaltoClient;
export type { SaltoClient, SaltoUser } from './types';
