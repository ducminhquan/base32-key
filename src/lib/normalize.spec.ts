import test from 'ava';

import { formatInput, toHexString, validate } from './decode';
import { Base32KeyError } from './errors';
import { testVectors } from './vectors';

// cspell: disable
test('toHexString >> normalize accepts sloppy input', (t) => {
  const options = { normalize: true };
  t.is(toHexString(' 222et 3zzgn ', options), 'c0ffee');
  t.is(toHexString('222ET3ZZGN', options), 'c0ffee');
  t.is(toHexString('222-ET3ZZ-GN', options), 'c0ffee');
  t.is(
    toHexString('AAAN3 ZW9I8 WFEWH', { ...options, case: 'lower' }),
    'cbd3e8a1494'
  );
  t.is(
    toHexString('222h-xr7u-m3v7-aejj', { ...options, checked: false }),
    'fedcba9876543210'
  );
  t.is(
    toHexString('HXR7U-M3V7A-EJJW', { ...options, grouped: false }),
    'fedcba9876543210'
  );
});

test('toHexString >> normalize still rejects bad keys', (t) => {
  const options = { normalize: true };
  t.is(
    t.throws<Base32KeyError>(() => toHexString('222ET-3ZZG', options)).code,
    'INVALID_LENGTH'
  );
  t.is(
    t.throws<Base32KeyError>(() => toHexString('  ', options)).code,
    'INVALID_LENGTH'
  );
  t.deepEqual(
    t.throws<Base32KeyError>(() => toHexString('222ET3ZZGX', options))
      .invalidGroups,
    [1]
  );
});

test('toHexString >> without normalize input is taken as is', (t) => {
  t.throws(() => toHexString('222et-3zzgn'));
  t.throws(() =>
    toHexString('222ET-3ZZGN', { normalize: false, case: 'lower' })
  );
});

test('toHexString >> options object matches positional form', (t) => {
  testVectors.map((v) => {
    t.is(toHexString(v.ucg, {}), v.hex);
    t.is(toHexString(v.lcg, { case: 'lower' }), v.hex);
    t.is(toHexString(v.uc, { grouped: false }), v.hex);
    t.is(toHexString(v.ucgu, { checked: false }), v.hex);
    t.is(
      toHexString(v.lcu, { grouped: false, checked: false, case: 'lower' }),
      v.hex
    );
  });
});

test('validate', (t) => {
  t.deepEqual(validate('222ET-3ZZGN'), { valid: true, invalidGroups: [] });
  t.deepEqual(validate('222et3zzgn'), { valid: true, invalidGroups: [] });
  t.deepEqual(validate('222ET-3ZZGX'), {
    valid: false,
    invalidGroups: [1],
    code: 'CHECKSUM_MISMATCH',
  });
  t.deepEqual(validate('222EX-3ZZG0'), {
    valid: false,
    invalidGroups: [0, 1],
    code: 'CHECKSUM_MISMATCH',
  });
  t.deepEqual(validate('222et-3zzgn', { normalize: false }), {
    valid: false,
    invalidGroups: [0, 1],
    code: 'INVALID_CHARACTER',
  });
  t.deepEqual(validate(''), {
    valid: false,
    invalidGroups: [0],
    code: 'INVALID_LENGTH',
  });
  t.throws(() => validate((42 as unknown) as string), {
    instanceOf: TypeError,
  });
});

test('formatInput', (t) => {
  t.is(formatInput(''), '');
  t.is(formatInput('222'), '222');
  t.is(formatInput('222et'), '222ET');
  t.is(formatInput('222et3'), '222ET-3');
  t.is(formatInput(' 222 et-3zz gn '), '222ET-3ZZGN');
  t.is(formatInput('aaan3zw9i8', { case: 'lower' }), 'aaan3-zw9i8');
  t.is(formatInput('222hxr7u', { checked: false }), '222H-XR7U');
  t.is(formatInput('hxr7u-m3v7a', { grouped: false }), 'HXR7UM3V7A');
  t.is(formatInput('222eo3'), '222EO-3');
  t.throws(() => formatInput((null as unknown) as string), {
    instanceOf: TypeError,
  });
});
