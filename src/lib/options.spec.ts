import { expect, test } from 'vitest';

import { fromHexString } from './encode';
import { resolveOptions } from './options';
import { testVectors } from './vectors';

test('resolveOptions >> legacy positional defaults', () => {
  expect(resolveOptions([])).toEqual({
    grouped: true,
    checked: true,
    upperCase: true,
    normalize: false,
  });
  expect(resolveOptions([false, false, false], true)).toEqual({
    grouped: false,
    checked: false,
    upperCase: false,
    normalize: true,
  });
});

test('resolveOptions >> options object', () => {
  expect(resolveOptions([{}])).toEqual({
    grouped: true,
    checked: true,
    upperCase: true,
    normalize: false,
  });
  expect(resolveOptions([{}], true).normalize).toEqual(true);
  expect(
    resolveOptions([
      { grouped: false, checked: false, case: 'lower', normalize: true },
    ])
  ).toEqual({
    grouped: false,
    checked: false,
    upperCase: false,
    normalize: true,
  });
  expect(
    resolveOptions([{ case: 'upper', normalize: false }], true).normalize
  ).toBe(false);
  expect(resolveOptions([{ case: 'upper' }]).upperCase).toBe(true);
});

test('resolveOptions >> rejects unknown case', () => {
  expect(() => resolveOptions([{ case: 'title' }])).toThrow(TypeError);
});

test('fromHexString >> options object matches positional form', () => {
  testVectors.map((v) => {
    expect(fromHexString(v.hex, {})).toBe(v.ucg);
    expect(fromHexString(v.hex, { case: 'lower' })).toBe(v.lcg);
    expect(fromHexString(v.hex, { grouped: false })).toBe(v.uc);
    expect(fromHexString(v.hex, { grouped: false, case: 'lower' })).toBe(v.lc);
    expect(fromHexString(v.hex, { checked: false })).toBe(v.ucgu);
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
