import test from 'ava';

import { baseDecode } from './utils';

test('baseDecode', (t) => {
  t.falsy(baseDecode('coffee', 'abcdef'));
});
