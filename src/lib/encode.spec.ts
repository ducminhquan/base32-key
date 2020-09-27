import test from 'ava';

import { fromHexString } from './encode';
import { testVectors } from './test-vectors';

test('fromHexString', (t) => {
  testVectors.map((v) => {
    t.is(fromHexString(v.hex), v.ucg);
    t.is(fromHexString(v.hex, true, true, true), v.ucg);
    t.is(fromHexString(v.hex, true, true, false), v.lcg);
    t.is(fromHexString(v.hex, false, true, true), v.uc);
    t.is(fromHexString(v.hex, false, true, false), v.lc);

    t.is(fromHexString(v.hex, true, false, false), v.lcgu);
    t.is(fromHexString(v.hex, false, false, true), v.ucu);
    t.is(fromHexString(v.hex, false, false, false), v.lcu);
  });
});
