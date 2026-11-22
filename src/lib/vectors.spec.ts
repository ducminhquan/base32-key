import { expect, test } from 'vitest';

import { fromBytes, toBytes } from './bytes';
import { validate } from './decode';
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
