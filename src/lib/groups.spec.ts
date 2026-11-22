import { describe, expect, test } from 'vitest';

import { thrown } from '../test/thrown';

import { toBigInt } from './bigint';
import { fromBytes, toBytes } from './bytes';
import { formatInput, toHexString, validate } from './decode';
import { Base32KeyError } from './errors';
import { generateKey } from './generate';

// cspell: disable
const key = '222ET-3ZZGN';

describe('groups option', () => {
  test('accepts the exact number of groups', () => {
    expect(toHexString(key, { groups: 2 })).toBe('c0ffee');
    expect(validate(key, { groups: 2 })).toEqual({
      valid: true,
      invalidGroups: [],
    });
    expect(toBigInt(key, { groups: 2 })).toBe(BigInt(12648430));
  });

  test('flags missing groups', () => {
    expect(validate('222ET', { groups: 4 })).toEqual({
      valid: false,
      invalidGroups: [1, 2, 3],
      code: 'INVALID_LENGTH',
    });
    const error = thrown<Base32KeyError>(() =>
      toHexString('222ET', { groups: 4 })
    );
    expect(error.code).toBe('INVALID_LENGTH');
    expect(error.invalidGroups).toEqual([1, 2, 3]);
    expect(error.message).toBe('Invalid key: expected 4 groups, got 1');
  });

  test('flags extra groups', () => {
    expect(validate(`${key}-22222`, { groups: 2 })).toEqual({
      valid: false,
      invalidGroups: [2],
      code: 'INVALID_LENGTH',
    });
  });

  test('keeps the reason of a bad group', () => {
    expect(validate('222ET-3ZZGX', { groups: 3 })).toEqual({
      valid: false,
      invalidGroups: [1, 2],
      code: 'CHECKSUM_MISMATCH',
    });
    expect(validate('222ET-3ZZGX-22222', { groups: 2 })).toEqual({
      valid: false,
      invalidGroups: [1, 2],
      code: 'CHECKSUM_MISMATCH',
    });
  });

  test('works with normalize and bytes', () => {
    expect(validate('222et3zzgn', { groups: 2 }).valid).toBe(true);
    const bytesKey = fromBytes(new Uint8Array([0, 1]), { withLength: true });
    expect(toBytes(bytesKey, { withLength: true, groups: 2 })).toEqual(
      new Uint8Array([0, 1])
    );
    expect(() => toBytes(bytesKey, { withLength: true, groups: 3 })).toThrow(
      Base32KeyError
    );
  });

  test('formatInput keeps at most that many groups', () => {
    expect(formatInput('222et3zzgn22', { groups: 2 })).toBe(key);
    expect(formatInput('222et', { groups: 2 })).toBe('222ET');
  });

  test('pairs with generateKey', () => {
    const generated = generateKey({ groups: 3 });
    expect(validate(generated, { groups: 3 }).valid).toBe(true);
    expect(validate(generated, { groups: 4 }).valid).toBe(false);
  });
});

describe("case: 'auto'", () => {
  test('decodes either alphabet', () => {
    expect(toHexString(key, { case: 'auto' })).toBe('c0ffee');
    expect(toHexString('aaan3-zw9i8-wfewh', { case: 'auto' })).toBe(
      'cbd3e8a1494'
    );
    expect(validate('aaan3 zw9i8 wfewh', { case: 'auto' }).valid).toBe(true);
    expect(toHexString('nb99qj', { case: 'auto', grouped: false })).toBe(
      'c0ffee'
    );
  });

  test('reports the closer alphabet when both fail', () => {
    // Uppercase with one bad group beats lowercase where all groups fail.
    expect(validate('222ET-3ZZGX', { case: 'auto' })).toEqual({
      valid: false,
      invalidGroups: [1],
      code: 'CHECKSUM_MISMATCH',
    });
    expect(validate('aaan3-zw9i8-wfewx', { case: 'auto' })).toEqual({
      valid: false,
      invalidGroups: [2],
      code: 'CHECKSUM_MISMATCH',
    });
  });

  test('is not an encoding option', () => {
    expect(() => generateKey({ case: 'auto' as unknown as 'upper' })).toThrow(
      TypeError
    );
  });
});
