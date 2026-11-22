import { afterEach, expect, test, vi } from 'vitest';

import { Base32KeyError } from './errors';
import { signKey, verifyKey } from './sign';

const payload = new Uint8Array([0, 0, 1, 42]);
const secret = 'correct horse battery staple';

afterEach(() => {
  vi.unstubAllGlobals();
});

test('signKey >> round-trips the payload', async () => {
  const key = await signKey(payload, secret);
  expect(key).toMatch(/^([2-9A-Z]{5}-)+[2-9A-Z]{5}$/);
  expect(key.split('-')).toHaveLength(5);
  expect(await verifyKey(key, secret)).toEqual(payload);
  expect(await signKey(payload, secret)).toBe(key);
});

test('signKey >> options are passed through', async () => {
  const key = await signKey(payload, secret, {
    tagBytes: 8,
    case: 'lower',
    prefix: 'LC',
  });
  expect(key.startsWith('LC-')).toBe(true);
  expect(key.substring(3)).toBe(key.substring(3).toLowerCase());
  expect(
    await verifyKey(key, secret, { tagBytes: 8, case: 'lower', prefix: 'LC' })
  ).toEqual(payload);
  expect(
    await verifyKey(key.toUpperCase().replace(/-/g, ' '), secret, {
      tagBytes: 8,
      case: 'auto',
      prefix: 'LC',
      normalize: true,
    })
  ).toEqual(payload);
});

test('signKey >> empty payload and byte or CryptoKey secrets', async () => {
  const bytes = new TextEncoder().encode(secret);
  const key = await signKey(new Uint8Array(0), bytes);
  expect(await verifyKey(key, secret)).toEqual(new Uint8Array(0));

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    bytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  expect(await signKey(payload, cryptoKey)).toBe(
    await signKey(payload, secret)
  );
  expect(await verifyKey(key, cryptoKey)).toEqual(new Uint8Array(0));
});

test('verifyKey >> rejects a wrong secret or a forged key', async () => {
  const key = await signKey(payload, secret);
  await expect(verifyKey(key, 'other secret')).rejects.toMatchObject({
    name: 'Base32KeyError',
    code: 'INVALID_SIGNATURE',
  });
  // A well-formed key carrying the same payload but no valid tag.
  const { fromBytes } = await import('./bytes');
  const forged = fromBytes(new Uint8Array([...payload, 1, 2, 3, 4, 5]), {
    withLength: true,
  });
  await expect(verifyKey(forged, secret)).rejects.toBeInstanceOf(
    Base32KeyError
  );
  const short = fromBytes(new Uint8Array([1, 2]), { withLength: true });
  await expect(verifyKey(short, secret)).rejects.toMatchObject({
    code: 'INVALID_SIGNATURE',
  });
  await expect(verifyKey(key, secret, { tagBytes: 6 })).rejects.toMatchObject({
    code: 'INVALID_SIGNATURE',
  });
});

test('verifyKey >> a typo is reported before the signature', async () => {
  const key = await signKey(payload, secret);
  const typo =
    key.substring(0, 6) + (key[6] === 'A' ? 'B' : 'A') + key.substring(7);
  await expect(verifyKey(typo, secret)).rejects.toMatchObject({
    code: 'CHECKSUM_MISMATCH',
    invalidGroups: [1],
  });
});

test('signKey >> invalid arguments', async () => {
  await expect(signKey(payload, secret, { tagBytes: 3 })).rejects.toThrow(
    RangeError
  );
  await expect(signKey(payload, secret, { tagBytes: 33 })).rejects.toThrow(
    RangeError
  );
  await expect(verifyKey('x', secret, { tagBytes: 4.5 })).rejects.toThrow(
    RangeError
  );
  await expect(signKey('ab' as unknown as Uint8Array, secret)).rejects.toThrow(
    TypeError
  );
  await expect(signKey(payload, '')).rejects.toThrow(TypeError);
  await expect(signKey(payload, secret, { grouped: false })).rejects.toThrow(
    TypeError
  );
});

test('signKey >> needs WebCrypto', async () => {
  vi.stubGlobal('crypto', undefined);
  await expect(signKey(payload, secret)).rejects.toThrow(/WebCrypto/);
});
