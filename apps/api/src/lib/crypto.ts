import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Opaque, URL-safe refresh token. Only its SHA-256 hash is stored. */
export function generateRefreshToken(): string {
  return randomBytes(48).toString('base64url');
}

export function hashPassword(password: string, rounds: number): Promise<string> {
  return bcrypt.hash(password, rounds);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** Stable JSON (sorted keys) so the same payload always hashes the same. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
  return `{${entries.join(',')}}`;
}

export function hashRequestBody(body: unknown): string {
  return sha256(stableStringify(body));
}
