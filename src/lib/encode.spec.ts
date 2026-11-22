import { expect, test } from 'vitest';

import { fromHexString } from './encode';
import { testVectors } from './vectors';

// cspell: disable

test('fromHexString', () => {
  testVectors.map((v) => {
    expect(fromHexString(v.hex)).toBe(v.ucg);
    expect(fromHexString(v.hex, true, true, true)).toBe(v.ucg);
    expect(fromHexString(v.hex, true, true, false)).toBe(v.lcg);
    expect(fromHexString(v.hex, false, true, true)).toBe(v.uc);
    expect(fromHexString(v.hex, false, true, false)).toBe(v.lc);

    expect(fromHexString(v.hex, true, false, false)).toBe(v.lcgu);
    expect(fromHexString(v.hex, false, false, true)).toBe(v.ucu);
    expect(fromHexString(v.hex, false, false, false)).toBe(v.lcu);
  });
});

test('fromHexString >> uppercase vectors without checksum', () => {
  testVectors.map((v) => {
    expect(fromHexString(v.hex, true, false, true)).toBe(v.ucgu);
  });
});

test('fromHexString >> accepts 0x prefix and uppercase hex', () => {
  expect(fromHexString('0xc0ffee')).toBe(fromHexString('c0ffee'));
  expect(fromHexString('0XC0FFEE')).toBe(fromHexString('c0ffee'));
});

test('fromHexString >> invalid', () => {
  expect(() => fromHexString('')).toThrow();
  expect(() => fromHexString('0x')).toThrow();
  expect(() => fromHexString('zz')).toThrow();
  expect(() => fromHexString('c0 ff ee')).toThrow();
  expect(() => fromHexString('c0ffee\n')).toThrow();
  expect(() => fromHexString(123 as unknown as string)).toThrow(TypeError);
});
