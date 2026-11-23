import { expect, test } from 'vitest';

import { fromBytes, toBytes } from './bytes';
import { validate } from './decode';
import vectors from '../../test-vectors.json';
import { bytesVectors, invalidVectors } from './vectors';

const fromHex = (hex: string) =>
  new Uint8Array((hex.match(/../g) ?? []).map((pair) => parseInt(pair, 16)));

test('test-vectors.json >> invalid keys', () => {
  for (const vector of invalidVectors) {
    expect(validate(vector.key, { normalize: false })).toEqual({
      valid: false,
      invalidGroups: vector.invalidGroups,
      code: vector.code,
    });
  }
});

test('test-vectors.json >> bytes with length', () => {
  for (const vector of bytesVectors) {
    const bytes = fromHex(vector.hex);
    expect(fromBytes(bytes, { withLength: true })).toBe(vector.withLength);
    expect(toBytes(vector.withLength, { withLength: true })).toEqual(bytes);
  }
});

test('test-vectors.json >> prefixes and normalized input', async () => {
  const { fromHexString } = await import('./encode');
  const { toHexString } = await import('./decode');
  for (const v of vectors.prefixed) {
    expect(fromHexString(v.hex, { prefix: v.prefix })).toBe(v.key);
    expect(toHexString(v.key, { prefix: v.prefix })).toBe(v.hex);
  }
  for (const v of vectors.invalidPrefixed) {
    expect(validate(v.key, { prefix: v.prefix }).code).toBe(v.code);
  }
  for (const v of vectors.normalized) {
    const { input, hex, ...options } = v as typeof v & {
      grouped?: boolean;
      case?: 'upper' | 'lower';
    };
    expect(toHexString(input, { ...options, normalize: true })).toBe(hex);
  }
});

test('test-vectors.json >> signed keys', async () => {
  const { signKey, verifyKey } = await import('./sign');
  for (const v of vectors.signed) {
    const { payloadHex, secret, key, ...options } = v as typeof v & {
      prefix?: string;
      case?: 'upper' | 'lower';
    };
    expect(await signKey(fromHex(payloadHex), secret, options)).toBe(key);
    expect(await verifyKey(key, secret, options)).toEqual(fromHex(payloadHex));
  }
  for (const v of vectors.invalidSigned) {
    await expect(
      verifyKey(v.key, v.secret, { tagBytes: v.tagBytes })
    ).rejects.toMatchObject({ code: v.code });
  }
});
