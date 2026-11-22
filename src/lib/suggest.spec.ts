import { describe, expect, test } from 'vitest';

import { fromBytes, toBytes } from './bytes';
import { formatInput, toHexString, validate } from './decode';
import { fromHexString } from './encode';
import { Base32KeyError } from './errors';
import { generateKey } from './generate';
import { suggest } from './suggest';

import { thrown } from '../test/thrown';

// cspell: disable
describe('suggest', () => {
  test('fixes swapped neighbours', () => {
    expect(suggest('222TE-3ZZGN')).toEqual(['222ET-3ZZGN']);
  });

  test('fixes look-alike characters', () => {
    expect(suggest('222ET-32ZGN')).toEqual(['222ET-3ZZGN']);
    expect(suggest('222ET-3ZZ6N')).toContain('222ET-3ZZGN');
    // Characters outside the alphabet
    expect(suggest('222ET-3ZZG0', { limit: 10 })).toEqual(
      suggest('222ET-3ZZGO', { limit: 10 })
    );
  });

  test('normalizes input and keeps valid groups', () => {
    expect(suggest('222te 3zzgn')).toEqual(['222ET-3ZZGN']);
  });

  test('returns nothing for valid or hopeless keys', () => {
    expect(suggest('222ET-3ZZGN')).toEqual([]);
    expect(suggest('222TE-3ZZGN-ZZZZZ')).toEqual([]);
    expect(suggest('222TE-3ZZGN', { groups: 3 })).toEqual([]);
    expect(suggest('XX-222ET', { prefix: 'LC' })).toEqual([]);
  });

  test('every suggestion is valid', () => {
    for (let i = 0; i < 50; ++i) {
      const key = generateKey({ groups: 2 });
      const typo = `${key[1]}${key[0]}${key.slice(2)}`;
      for (const candidate of suggest(typo, { limit: 10 })) {
        expect(validate(candidate).valid).toBe(true);
      }
      if (key[0] !== key[1]) {
        expect(suggest(typo, { limit: 10 })).toContain(key);
      }
    }
  });

  test('options', () => {
    expect(suggest('aaan3-zw9i8-wfewh', { case: 'auto' })).toEqual([]);
    expect(suggest('aaan3-zw9i8-wfeuh', { case: 'auto' })).toEqual(
      suggest('aaan3-zw9i8-wfeuh', { case: 'lower' })
    );
    expect(suggest('LC-222TE-3ZZGN', { prefix: 'LC' })).toEqual([
      'LC-222ET-3ZZGN',
    ]);
    expect(suggest('222ET-3ZZ6N', { limit: 1 })).toHaveLength(1);
    expect(suggest('nb99jq', { grouped: false, case: 'lower' })).toContain(
      'nb99qj'
    );
    expect(() => suggest('x', { limit: 0 })).toThrow(RangeError);
  });
});

describe('prefix option', () => {
  test('encodes with the prefix', () => {
    expect(fromHexString('c0ffee', { prefix: 'LC' })).toBe('LC-222ET-3ZZGN');
    expect(generateKey({ prefix: 'LC', groups: 1 })).toMatch(
      /^LC-[2-9A-Z]{5}$/
    );
    expect(fromBytes(new Uint8Array([1]), { prefix: 'v2' })).toBe('v2-22237');
  });

  test('decodes and requires the prefix', () => {
    expect(toHexString('LC-222ET-3ZZGN', { prefix: 'LC' })).toBe('c0ffee');
    expect(
      toHexString(' lc 222et3zzgn', { prefix: 'LC', normalize: true })
    ).toBe('c0ffee');
    expect(toBytes('v2-22237', { prefix: 'v2' })).toEqual(new Uint8Array([1]));
    const error = thrown<Base32KeyError>(() =>
      toHexString('222ET-3ZZGN', { prefix: 'LC' })
    );
    expect(error.code).toBe('INVALID_PREFIX');
    expect(error.message).toBe('Invalid key: expected the prefix "LC"');
    expect(
      validate('lc-222ET-3ZZGN', { prefix: 'LC', normalize: false })
    ).toEqual({
      valid: false,
      invalidGroups: [],
      code: 'INVALID_PREFIX',
    });
    expect(validate('lc-222ET-3ZZGN', { prefix: 'LC' }).valid).toBe(true);
  });

  test('formatInput adds the prefix', () => {
    expect(formatInput('222et3zzgn', { prefix: 'LC' })).toBe('LC-222ET-3ZZGN');
    expect(formatInput('lc222et3', { prefix: 'LC' })).toBe('LC-222ET-3');
    expect(formatInput('l', { prefix: 'LC' })).toBe('L');
    expect(formatInput('', { prefix: 'LC' })).toBe('');
  });

  test('rejects a bad prefix', () => {
    for (const prefix of ['L-C', 'L C', 'é']) {
      expect(() => fromHexString('ff', { prefix })).toThrow(TypeError);
    }
    expect(fromHexString('ff', { prefix: '' })).toBe('229ZN');
  });
});
