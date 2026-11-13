import { describe, expect, it } from 'vitest';

import { parseCredentials, sha256Hex } from '../src/auth';

const ID = '0123456789abcdef0123456789abcdef';
const SECRET = 'a'.repeat(64);

describe('device credentials', () => {
  it('parses a device ID and secret', () => {
    expect(parseCredentials(`Bearer ${ID}:${SECRET}`)).toEqual({ deviceId: ID, secret: SECRET });
  });

  it('rejects anything else, including the legacy shared token', () => {
    expect(parseCredentials(null)).toBeNull();
    expect(parseCredentials('Bearer some-shared-token')).toBeNull();
    expect(parseCredentials(`Bearer ${ID}:${SECRET.slice(1)}`)).toBeNull();
    expect(parseCredentials(`Bearer ${ID.toUpperCase()}:${SECRET}`)).toBeNull();
    expect(parseCredentials(`Bearer ../main:${SECRET}`)).toBeNull();
  });

  it('hashes secrets with SHA-256', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});
