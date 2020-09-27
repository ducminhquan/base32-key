import test from 'ava';

import { toHexString } from './decode';
import { testVectors } from './vectors';

test('toHexString', (t) => {
  testVectors.map((v) => {
    t.is(toHexString(v.ucg), v.hex);
    t.is(toHexString(v.ucg, true, true, true), v.hex);
    t.is(toHexString(v.lcg, true, true, false), v.hex);
    t.is(toHexString(v.uc, false, true, true), v.hex);
    t.is(toHexString(v.lc, false, true, false), v.hex);

    t.is(toHexString(v.lcgu, true, false, false), v.hex);
    t.is(toHexString(v.ucu, false, false, true), v.hex);
    t.is(toHexString(v.lcu, false, false, false), v.hex);
  });
});

// cspell: disable
test('toHexString >> invalid', (t) => {
  t.throws(() => {
    toHexString('222HQ-XR7UV-M3V7M-AEJJA');
  });
  t.throws(() => {
    toHexString('222HQ-XR7UV-M3V7M-AEJJ');
  });
});
