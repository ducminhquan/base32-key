// Property-based tests: each property runs against many random inputs.
import fc from 'fast-check';
import { describe, expect, test } from 'vitest';

import { fromBigInt, toBigInt } from './bigint';
import { fromBytes, toBytes } from './bytes';
import { toHexString, validate } from './decode';
import { encodeBase32, fromHexString } from './encode';
import { generateKey } from './generate';
import { BASE_32_DIGITS } from './utils';

const options = fc.record({
  grouped: fc.boolean(),
  checked: fc.boolean(),
  case: fc.constantFrom<'upper' | 'lower'>('upper', 'lower'),
});

/** Hex without leading zeros, as toHexString returns it. */
const canonicalHex = fc
  .string({ unit: fc.constantFrom(...'0123456789abcdef'), minLength: 1 })
  .map((hex) => hex.replace(/^0+(?=.)/, ''));

describe('round trips', () => {
  test('hex', () => {
    fc.assert(
      fc.property(canonicalHex, options, (hex, opts) => {
        expect(toHexString(fromHexString(hex, opts), opts)).toBe(hex);
      })
    );
  });

  test('BigInt', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: BigInt(0) }), options, (value, opts) => {
        expect(toBigInt(fromBigInt(value, opts), opts)).toBe(value);
      })
    );
  });

  test('bytes with length', () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 64 }), (bytes) => {
        const key = fromBytes(bytes, { withLength: true });
        expect(toBytes(key, { withLength: true })).toEqual(bytes);
      })
    );
  });

  test('bytes with a known length', () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 1, maxLength: 64 }), (bytes) => {
        const key = fromBytes(bytes);
        expect(toBytes(key, { length: bytes.length })).toEqual(bytes);
      })
    );
  });

  test('normalized input', () => {
    fc.assert(
      fc.property(canonicalHex, (hex) => {
        const key = fromHexString(hex);
        const messy = ` ${key.toLowerCase().replace(/-/g, ' ')} `;
        expect(toHexString(messy, { normalize: true })).toBe(hex);
      })
    );
  });

  test('generated keys are valid and fixed length', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 8 }), (groups) => {
        const key = generateKey({ groups });
        expect(key).toHaveLength(groups * 6 - 1);
        expect(validate(key, { groups })).toEqual({
          valid: true,
          invalidGroups: [],
        });
      })
    );
  });
});

// The README promises that the per-group CRC-5 check digit catches every
// single-character typo and every swap of two adjacent characters.
describe('check digits catch typing mistakes', () => {
  // One random group: 4 data digits and its check digit.
  const group = fc
    .array(fc.integer({ min: 0, max: 31 }), { minLength: 4, maxLength: 4 })
    .map((digits) => encodeBase32(digits, true, true, true));

  test('every single-character substitution', () => {
    fc.assert(
      fc.property(group, (key) => {
        for (let i = 0; i < 5; ++i) {
          for (const c of BASE_32_DIGITS) {
            if (c === key[i]) continue;
            const typo = key.slice(0, i) + c + key.slice(i + 1);
            expect(validate(typo, { normalize: false }).valid).toBe(false);
          }
        }
      })
    );
  });

  test('every adjacent transposition', () => {
    fc.assert(
      fc.property(group, (key) => {
        for (let i = 0; i < 4; ++i) {
          if (key[i] === key[i + 1]) continue;
          const swapped =
            key.slice(0, i) + key[i + 1] + key[i] + key.slice(i + 2);
          expect(validate(swapped, { normalize: false }).valid).toBe(false);
        }
      })
    );
  });
});
