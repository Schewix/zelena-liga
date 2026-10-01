import { pbkdf2 as pbkdf2Callback, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const pbkdf2 = promisify(pbkdf2Callback);

export const PBKDF2_ITERATIONS = 210_000;
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

export function generateTemporaryPassword(length = 12): string {
  if (length <= 0) {
    throw new Error('Invalid password length');
  }

  const bytes = randomBytes(length);
  let password = '';
  for (let i = 0; i < length; i += 1) {
    password += PASSWORD_ALPHABET[bytes[i] % PASSWORD_ALPHABET.length];
  }
  return password;
}

export async function hashPassword(password: string): Promise<string> {
  if (!password) {
    throw new Error('Missing password');
  }

  const salt = randomBytes(16);
  const derived = await pbkdf2(password, salt, PBKDF2_ITERATIONS, 32, 'sha256');
  return `pbkdf2$sha256$${PBKDF2_ITERATIONS}$${salt.toString('base64')}$${derived.toString('base64')}`;
}

async function verifyPbkdf2(hash: string, password: string) {
  const parts = hash.split('$');
  if (parts.length !== 5 || parts[1] !== 'sha256') {
    return false;
  }
  const iterations = Number(parts[2]);
  if (!Number.isFinite(iterations) || iterations <= 0) {
    return false;
  }
  const salt = Buffer.from(parts[3], 'base64');
  const expected = Buffer.from(parts[4], 'base64');
  if (!salt.length || !expected.length) {
    return false;
  }
  const derived = await pbkdf2(password, salt, iterations, expected.length, 'sha256');
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

// Starší účty mají hash z argon2, novější z PBKDF2.
export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  if (hash.startsWith('pbkdf2$')) {
    return verifyPbkdf2(hash, password);
  }
  const { default: argon2 } = await import('argon2');
  return argon2.verify(hash, password);
}
