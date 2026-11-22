import { expect, test } from 'vitest';

import { baseDecode } from './utils';

test('baseDecode', () => {
  expect(baseDecode('coffee', 'abcdef')).toBeFalsy();
});

test('baseDecode >> rejects characters outside ASCII', () => {
  expect(baseDecode('2é', '23')).toBeNull();
  expect(baseDecode('32', '23')).toEqual([1, 0]);
});
