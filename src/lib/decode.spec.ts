import { expect, test } from 'vitest';

import { toHexString } from './decode';
import { fromHexString } from './encode';
import { testVectors } from './vectors';

test('toHexString', () => {
  testVectors.map((v) => {
    expect(toHexString(v.ucg)).toBe(v.hex);
    expect(toHexString(v.ucg, true, true, true)).toBe(v.hex);
    expect(toHexString(v.lcg, true, true, false)).toBe(v.hex);
    expect(toHexString(v.uc, false, true, true)).toBe(v.hex);
    expect(toHexString(v.lc, false, true, false)).toBe(v.hex);

    expect(toHexString(v.lcgu, true, false, false)).toBe(v.hex);
    expect(toHexString(v.ucu, false, false, true)).toBe(v.hex);
    expect(toHexString(v.lcu, false, false, false)).toBe(v.hex);
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
    expect(toHexString(v.ucgu, true, false, true)).toBe(v.hex);
  });
});

test('toHexString >> zero round-trips in every mode', () => {
  [true, false].map((grouped) =>
    [true, false].map((checked) =>
      [true, false].map((upperCase) => {
        const key = fromHexString('0', grouped, checked, upperCase);
        expect(toHexString(key, grouped, checked, upperCase)).toBe('0');
      })
    )
  );
});

test('toHexString >> empty or malformed keys', () => {
  expect(() => toHexString('')).toThrow();
  expect(() => toHexString('', false, false)).toThrow();
  expect(() => toHexString('', false, true)).toThrow();
  expect(() => toHexString('222ET-3ZZGN-')).toThrow();
  expect(() => toHexString(null as unknown as string)).toThrow(TypeError);
});
