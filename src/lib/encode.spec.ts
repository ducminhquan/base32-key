import test from 'ava';

import { fromHexString } from './encode';
import { testVectors } from './vectors';

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

test('fromHexString >> uppercase vectors without checksum', (t) => {
  testVectors.map((v) => {
    t.is(fromHexString(v.hex, true, false, true), v.ucgu);
  });
});

test('fromHexString >> accepts 0x prefix and uppercase hex', (t) => {
  t.is(fromHexString('0xc0ffee'), fromHexString('c0ffee'));
  t.is(fromHexString('0XC0FFEE'), fromHexString('c0ffee'));
});

test('fromHexString >> invalid', (t) => {
  t.throws(() => fromHexString(''));
  t.throws(() => fromHexString('0x'));
  t.throws(() => fromHexString('zz'));
  t.throws(() => fromHexString('c0 ff ee'));
  t.throws(() => fromHexString('c0ffee\n'));
  t.throws(() => fromHexString((123 as unknown) as string), {
    instanceOf: TypeError,
  });
});
