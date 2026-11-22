import { expect, test } from 'vitest';

import { thrown } from '../test/thrown';

import { formatInput, toHexString, validate } from './decode';
import { Base32KeyError } from './errors';
import { testVectors } from './vectors';

// cspell: disable
test('toHexString >> normalize accepts sloppy input', () => {
  const options = { normalize: true };
  expect(toHexString(' 222et 3zzgn ', options)).toBe('c0ffee');
  expect(toHexString('222ET3ZZGN', options)).toBe('c0ffee');
  expect(toHexString('222-ET3ZZ-GN', options)).toBe('c0ffee');
  expect(toHexString('AAAN3 ZW9I8 WFEWH', { ...options, case: 'lower' })).toBe(
    'cbd3e8a1494'
  );
  expect(
    toHexString('222h-xr7u-m3v7-aejj', { ...options, checked: false })
  ).toBe('fedcba9876543210');
  expect(toHexString('HXR7U-M3V7A-EJJW', { ...options, grouped: false })).toBe(
    'fedcba9876543210'
  );
});

test('toHexString >> normalize still rejects bad keys', () => {
  const options = { normalize: true };
  expect(
    thrown<Base32KeyError>(() => toHexString('222ET-3ZZG', options)).code
  ).toBe('INVALID_LENGTH');
  expect(thrown<Base32KeyError>(() => toHexString('  ', options)).code).toBe(
    'INVALID_LENGTH'
  );
  expect(
    thrown<Base32KeyError>(() => toHexString('222ET3ZZGX', options))
      .invalidGroups
  ).toEqual([1]);
});

test('toHexString >> without normalize input is taken as is', () => {
  expect(() => toHexString('222et-3zzgn')).toThrow();
  expect(() =>
    toHexString('222ET-3ZZGN', { normalize: false, case: 'lower' })
  ).toThrow();
});

test('toHexString >> options object matches positional form', () => {
  testVectors.map((v) => {
    expect(toHexString(v.ucg, {})).toBe(v.hex);
    expect(toHexString(v.lcg, { case: 'lower' })).toBe(v.hex);
    expect(toHexString(v.uc, { grouped: false })).toBe(v.hex);
    expect(toHexString(v.ucgu, { checked: false })).toBe(v.hex);
    expect(
      toHexString(v.lcu, { grouped: false, checked: false, case: 'lower' })
    ).toBe(v.hex);
  });
});

test('validate', () => {
  expect(validate('222ET-3ZZGN')).toEqual({ valid: true, invalidGroups: [] });
  expect(validate('222et3zzgn')).toEqual({ valid: true, invalidGroups: [] });
  expect(validate('222ET-3ZZGX')).toEqual({
    valid: false,
    invalidGroups: [1],
    code: 'CHECKSUM_MISMATCH',
  });
  expect(validate('222EX-3ZZG0')).toEqual({
    valid: false,
    invalidGroups: [0, 1],
    code: 'CHECKSUM_MISMATCH',
  });
  expect(validate('222et-3zzgn', { normalize: false })).toEqual({
    valid: false,
    invalidGroups: [0, 1],
    code: 'INVALID_CHARACTER',
  });
  expect(validate('')).toEqual({
    valid: false,
    invalidGroups: [0],
    code: 'INVALID_LENGTH',
  });
  expect(() => validate(42 as unknown as string)).toThrow(TypeError);
});

test('formatInput', () => {
  expect(formatInput('')).toBe('');
  expect(formatInput('222')).toBe('222');
  expect(formatInput('222et')).toBe('222ET');
  expect(formatInput('222et3')).toBe('222ET-3');
  expect(formatInput(' 222 et-3zz gn ')).toBe('222ET-3ZZGN');
  expect(formatInput('aaan3zw9i8', { case: 'lower' })).toBe('aaan3-zw9i8');
  expect(formatInput('222hxr7u', { checked: false })).toBe('222H-XR7U');
  expect(formatInput('hxr7u-m3v7a', { grouped: false })).toBe('HXR7UM3V7A');
  expect(formatInput('222eo3')).toBe('222EO-3');
  expect(() => formatInput(null as unknown as string)).toThrow(TypeError);
});
