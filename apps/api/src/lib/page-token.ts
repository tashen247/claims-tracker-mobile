/** Opaque keyset-pagination token over (created_at DESC, id DESC). */
export interface PageToken {
  createdAt: Date;
  id: string;
}

export function encodePageToken(token: PageToken): string {
  return Buffer.from(`${token.createdAt.toISOString()}|${token.id}`).toString('base64url');
}

export function decodePageToken(value: string): PageToken | null {
  try {
    const [iso, id] = Buffer.from(value, 'base64url').toString('utf8').split('|');
    if (!iso || !id) return null;
    const createdAt = new Date(iso);
    if (Number.isNaN(createdAt.getTime())) return null;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}
