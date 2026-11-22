import test from 'ava';

import { toHexString } from './decode';
import { fromHexString } from './encode';
import { Base32KeyError } from './errors';

// cspell: disable
test('Base32KeyError >> defaults', (t) => {
  const error = new Base32KeyError('INVALID_HEX', 'bad');
  t.true(error instanceof Error);
  t.is(error.name, 'Base32KeyError');
  t.is(error.code, 'INVALID_HEX');
  t.deepEqual(error.invalidGroups, []);
});

test('toHexString >> reports the invalid group', (t) => {
  const error = t.throws<Base32KeyError>(() => toHexString('222ET-3ZZGX'), {
    instanceOf: Base32KeyError,
  });
  t.is(error.code, 'CHECKSUM_MISMATCH');
  t.deepEqual(error.invalidGroups, [1]);
  t.is(
    error.message,
    'Invalid key: group 2 has a check digit that does not match'
  );
});

test('toHexString >> reports every invalid group', (t) => {
  const error = t.throws<Base32KeyError>(() => toHexString('222EX-3ZZGN-2222'));
  t.is(error.code, 'CHECKSUM_MISMATCH');
  t.deepEqual(error.invalidGroups, [0, 2]);
  t.is(
    error.message,
    'Invalid key: groups 1, 3 have a check digit that does not match'
  );
});

test('toHexString >> error codes', (t) => {
  t.is(
    t.throws<Base32KeyError>(() => toHexString('222ET-3ZZG0')).code,
    'INVALID_CHARACTER'
  );
  t.is(
    t.throws<Base32KeyError>(() => toHexString('222E')).code,
    'INVALID_LENGTH'
  );
  t.is(
    t.throws<Base32KeyError>(() => toHexString('')).code,
    'INVALID_LENGTH'
  );
});

test('fromHexString >> INVALID_HEX', (t) => {
  const error = t.throws<Base32KeyError>(() => fromHexString('xyz'));
  t.true(error instanceof Base32KeyError);
  t.is(error.code, 'INVALID_HEX');
});
