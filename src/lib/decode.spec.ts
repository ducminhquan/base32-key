import { expect, test } from 'vitest';

import { toHexString } from './decode';
import { fromHexString } from './encode';
import { testVectors } from './vectors';

test('toHexString', () => {
  testVectors.map((v) => {
    expect(toHexString(v.ucg)).toBe(v.hex);
    expect(toHexString(v.ucg, {})).toBe(v.hex);
    expect(toHexString(v.lcg, { case: 'lower' })).toBe(v.hex);
    expect(toHexString(v.uc, { grouped: false })).toBe(v.hex);
    expect(toHexString(v.lc, { grouped: false, case: 'lower' })).toBe(v.hex);

    expect(toHexString(v.lcgu, { checked: false, case: 'lower' })).toBe(v.hex);
    expect(toHexString(v.ucu, { grouped: false, checked: false })).toBe(v.hex);
    expect(
      toHexString(v.lcu, { grouped: false, checked: false, case: 'lower' })
    ).toBe(v.hex);
  });
});

// cspell: disable
test('toHexString >> invalid', () => {
  expect(() => {
    toHexString('222HQ-XR7UV-M3V7M-AEJJA');
  }).toThrow();
  expect(() => {
    toHexString('222HQ-XR7UV-M3V7M-AEJJ');
  }).toThrow();
});

test('toHexString >> uppercase vectors without checksum', () => {
  testVectors.map((v) => {
    expect(toHexString(v.ucgu, { checked: false })).toBe(v.hex);
  });
});

test('toHexString >> zero round-trips in every mode', () => {
  [true, false].map((grouped) =>
    [true, false].map((checked) =>
      [true, false].map((upperCase) => {
        const options = {
          grouped,
          checked,
          case: upperCase ? ('upper' as const) : ('lower' as const),
        };
        const key = fromHexString('0', options);
        expect(toHexString(key, options)).toBe('0');
      })
    )
  );
});

test('toHexString >> empty or malformed keys', () => {
  expect(() => toHexString('')).toThrow();
  expect(() => toHexString('', { grouped: false, checked: false })).toThrow();
  expect(() => toHexString('', { grouped: false })).toThrow();
  expect(() => toHexString('222ET-3ZZGN-')).toThrow();
  expect(() => toHexString(null as unknown as string)).toThrow(TypeError);
});
