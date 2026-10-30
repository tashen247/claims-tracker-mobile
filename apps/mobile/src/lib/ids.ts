import * as Crypto from 'expo-crypto';

export function newIdempotencyKey(): string {
  return Crypto.randomUUID();
}

export function newLocalId(): string {
  return `draft-${Crypto.randomUUID()}`;
}
