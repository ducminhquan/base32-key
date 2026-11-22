import { expect, test } from 'vitest';

import { baseDecode } from './utils';

test('baseDecode', () => {
  expect(baseDecode('coffee', 'abcdef')).toBeFalsy();
});
