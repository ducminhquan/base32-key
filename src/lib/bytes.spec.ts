import { describe, expect, test } from 'vitest';

import { thrown } from '../test/thrown';

import { fromBytes, MAX_LENGTH_PREFIXED_BYTES, toBytes } from './bytes';
import { Base32KeyError } from './errors';

const bytes = (...values: number[]) => new Uint8Array(values);

// cspell: disable
describe('fromBytes / toBytes', () => {
  test('round trip', () => {
    expect(fromBytes(bytes(0xc0, 0xff, 0xee))).toBe('222ET-3ZZGN');
    expect(toBytes('222ET-3ZZGN')).toEqual(bytes(0xc0, 0xff, 0xee));
    expect(toBytes('222et 3zzgn', { normalize: true })).toEqual(
      bytes(0xc0, 0xff, 0xee)
    );
    expect(fromBytes(bytes(0x0f), { case: 'lower', grouped: false })).toBe(
      'ry'
    );
    expect(toBytes(fromBytes(bytes(0x0f)))).toEqual(bytes(0x0f));
  });

  test('leading zero bytes are dropped without length', () => {
    expect(toBytes(fromBytes(bytes(0, 0, 0x12)))).toEqual(bytes(0x12));
    expect(toBytes('22222')).toEqual(bytes(0));
  });

  test('length pads with zero bytes', () => {
    expect(toBytes('222ET-3ZZGN', { length: 4 })).toEqual(
      bytes(0, 0xc0, 0xff, 0xee)
    );
    expect(toBytes('22222', { length: 0 })).toEqual(bytes());
    expect(toBytes('22222', { length: 2 })).toEqual(bytes(0, 0));
    expect(
      thrown<Base32KeyError>(() => toBytes('222ET-3ZZGN', { length: 2 })).code
    ).toBe('INVALID_LENGTH');
    expect(() => toBytes('222ET-3ZZGN', { length: -1 })).toThrow(RangeError);
    expect(() => toBytes('222ET-3ZZGN', { length: 1.5 })).toThrow(RangeError);
  });

  test('withLength keeps the exact bytes', () => {
    expect(fromBytes(bytes(0, 0xff), { withLength: true })).toBe('2224C-229ZN');
    for (const value of [
      bytes(),
      bytes(0),
      bytes(0, 0, 0),
      bytes(0, 0xff),
      bytes(1, 2, 3, 4, 5, 6, 7, 8, 9, 10),
    ]) {
      const key = fromBytes(value, { withLength: true });
      expect(toBytes(key, { withLength: true })).toEqual(value);
      const lower = fromBytes(value, { withLength: true, case: 'lower' });
      expect(toBytes(lower, { withLength: true, case: 'lower' })).toEqual(
        value
      );
    }
  });

  test('withLength detects missing or extra groups', () => {
    const key = fromBytes(bytes(1, 2, 3, 4, 5, 6), { withLength: true });
    const groups = key.split('-');
    const cut = groups.slice(0, -1).join('-');
    const error = thrown<Base32KeyError>(() =>
      toBytes(cut, { withLength: true })
    );
    expect(error.code).toBe('INVALID_LENGTH');
    expect(error.message).toBe(
      'Invalid key: a 6-byte value needs 4 groups, got 3'
    );
    expect(
      thrown<Base32KeyError>(() =>
        toBytes(`${key}-22222`, { withLength: true })
      ).code
    ).toBe('INVALID_LENGTH');
    // Non-zero padding: claims 1 byte but stores 3 hex digits.
    const padded = fromBytes(bytes(1, 2), { withLength: true }).replace(
      /^.{5}/,
      fromBytes(bytes(0, 0, 1), { withLength: true }).slice(6, 11)
    );
    expect(
      thrown<Base32KeyError>(() => toBytes(padded, { withLength: true })).code
    ).toBe('INVALID_LENGTH');
  });

  test('withLength requires grouped keys', () => {
    expect(() =>
      fromBytes(bytes(1), { withLength: true, grouped: false })
    ).toThrow(TypeError);
    expect(() =>
      toBytes('22222', { withLength: true, grouped: false })
    ).toThrow(TypeError);
  });

  test('invalid input', () => {
    expect(() => fromBytes(bytes())).toThrow(RangeError);
    expect(() => fromBytes([1, 2] as unknown as Uint8Array)).toThrow(TypeError);
    expect(() =>
      fromBytes(new Uint8Array(MAX_LENGTH_PREFIXED_BYTES + 1), {
        withLength: true,
      })
    ).toThrow(RangeError);
    expect(() => toBytes('222ET-3ZZGX')).toThrow(Base32KeyError);
    expect(() => toBytes('222ET-3ZZGX', { withLength: true })).toThrow(
      Base32KeyError
    );
  });
});
