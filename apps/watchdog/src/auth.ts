// Phones authenticate as `Authorization: Bearer <deviceId>:<secret>`. Both halves are random and
// made by the app on first launch; there is no sign-up. The device ID picks the phone's own
// Durable Object, which remembers the secret's SHA-256 the first time it sees it and only
// accepts that secret afterwards.

export interface DeviceCredentials {
  deviceId: string;
  secret: string;
}

const CREDENTIALS = /^([0-9a-f]{32}):([0-9a-f]{64})$/;

export function parseCredentials(header: string | null): DeviceCredentials | null {
  const token = header?.replace(/^Bearer\s+/i, '').trim() ?? '';
  const m = CREDENTIALS.exec(token);
  return m ? { deviceId: m[1]!, secret: m[2]! } : null;
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
