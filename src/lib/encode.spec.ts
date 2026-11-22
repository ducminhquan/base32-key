import { expect, test } from 'vitest';

import { fromHexString } from './encode';
import { testVectors } from './vectors';

// cspell: disable

test('fromHexString', () => {
  testVectors.map((v) => {
    expect(fromHexString(v.hex)).toBe(v.ucg);
    expect(fromHexString(v.hex, {})).toBe(v.ucg);
    expect(fromHexString(v.hex, { case: 'lower' })).toBe(v.lcg);
    expect(fromHexString(v.hex, { grouped: false })).toBe(v.uc);
    expect(fromHexString(v.hex, { grouped: false, case: 'lower' })).toBe(v.lc);

    expect(fromHexString(v.hex, { checked: false, case: 'lower' })).toBe(
      v.lcgu
    );
    expect(fromHexString(v.hex, { grouped: false, checked: false })).toBe(
      v.ucu
    );
    expect(
      fromHexString(v.hex, { grouped: false, checked: false, case: 'lower' })
    ).toBe(v.lcu);
  });
});

test('fromHexString >> uppercase vectors without checksum', () => {
  testVectors.map((v) => {
    expect(fromHexString(v.hex, { checked: false })).toBe(v.ucgu);
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
