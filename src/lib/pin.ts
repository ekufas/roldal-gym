// PIN utilities. Salto KS supports numeric PINs (typically 4–8 digits).
import { randomInt } from 'crypto';

export function generatePin(length = 6): string {
  let out = '';
  for (let i = 0; i < length; i++) out += randomInt(0, 10).toString();
  return out;
}
