import test from 'ava';

import { toHexString } from './decode';
import { fromHexString } from './encode';
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

test('toHexString >> uppercase vectors without checksum', (t) => {
  testVectors.map((v) => {
    t.is(toHexString(v.ucgu, true, false, true), v.hex);
  });
});

test('toHexString >> zero round-trips in every mode', (t) => {
  [true, false].map((grouped) =>
    [true, false].map((checked) =>
      [true, false].map((upperCase) => {
        const key = fromHexString('0', grouped, checked, upperCase);
        t.is(toHexString(key, grouped, checked, upperCase), '0');
      })
    )
  );
});

test('toHexString >> empty or malformed keys', (t) => {
  t.throws(() => toHexString(''));
  t.throws(() => toHexString('', false, false));
  t.throws(() => toHexString('', false, true));
  t.throws(() => toHexString('222ET-3ZZGN-'));
  t.throws(() => toHexString((null as unknown) as string), {
    instanceOf: TypeError,
  });
});
