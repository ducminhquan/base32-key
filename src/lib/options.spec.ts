import test from 'ava';

import { fromHexString } from './encode';
import { resolveOptions } from './options';
import { testVectors } from './vectors';

test('resolveOptions >> legacy positional defaults', (t) => {
  t.deepEqual(resolveOptions([]), {
    grouped: true,
    checked: true,
    upperCase: true,
    normalize: false,
  });
  t.deepEqual(resolveOptions([false, false, false], true), {
    grouped: false,
    checked: false,
    upperCase: false,
    normalize: true,
  });
});

test('resolveOptions >> options object', (t) => {
  t.deepEqual(resolveOptions([{}]), {
    grouped: true,
    checked: true,
    upperCase: true,
    normalize: false,
  });
  t.deepEqual(resolveOptions([{}], true).normalize, true);
  t.deepEqual(
    resolveOptions([
      { grouped: false, checked: false, case: 'lower', normalize: true },
    ]),
    { grouped: false, checked: false, upperCase: false, normalize: true }
  );
  t.is(
    resolveOptions([{ case: 'upper', normalize: false }], true).normalize,
    false
  );
  t.is(resolveOptions([{ case: 'upper' }]).upperCase, true);
});

test('resolveOptions >> rejects unknown case', (t) => {
  t.throws(() => resolveOptions([{ case: 'title' }]), {
    instanceOf: TypeError,
  });
});

test('fromHexString >> options object matches positional form', (t) => {
  testVectors.map((v) => {
    t.is(fromHexString(v.hex, {}), v.ucg);
    t.is(fromHexString(v.hex, { case: 'lower' }), v.lcg);
    t.is(fromHexString(v.hex, { grouped: false }), v.uc);
    t.is(fromHexString(v.hex, { grouped: false, case: 'lower' }), v.lc);
    t.is(fromHexString(v.hex, { checked: false }), v.ucgu);
    t.is(fromHexString(v.hex, { checked: false, case: 'lower' }), v.lcgu);
    t.is(fromHexString(v.hex, { grouped: false, checked: false }), v.ucu);
    t.is(
      fromHexString(v.hex, { grouped: false, checked: false, case: 'lower' }),
      v.lcu
    );
  });
});
