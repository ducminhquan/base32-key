import { expect, test } from 'vitest';

import { thrown } from '../test/thrown';

import { toHexString } from './decode';
import { fromHexString } from './encode';
import { Base32KeyError } from './errors';

// cspell: disable
test('Base32KeyError >> defaults', () => {
  const error = new Base32KeyError('INVALID_HEX', 'bad');
  expect(error instanceof Error).toBe(true);
  expect(error.name).toBe('Base32KeyError');
  expect(error.code).toBe('INVALID_HEX');
  expect(error.invalidGroups).toEqual([]);
});

test('toHexString >> reports the invalid group', () => {
  const error = thrown<Base32KeyError>(() => toHexString('222ET-3ZZGX'));
  expect(error.code).toBe('CHECKSUM_MISMATCH');
  expect(error.invalidGroups).toEqual([1]);
  expect(error.message).toBe(
    'Invalid key: group 2 has a check digit that does not match'
  );
});

test('toHexString >> reports every invalid group', () => {
  const error = thrown<Base32KeyError>(() => toHexString('222EX-3ZZGN-2222'));
  expect(error.code).toBe('CHECKSUM_MISMATCH');
  expect(error.invalidGroups).toEqual([0, 2]);
  expect(error.message).toBe(
    'Invalid key: groups 1, 3 have a check digit that does not match'
  );
});

test('toHexString >> error codes', () => {
  expect(thrown<Base32KeyError>(() => toHexString('222ET-3ZZG0')).code).toBe(
    'INVALID_CHARACTER'
  );
  expect(thrown<Base32KeyError>(() => toHexString('222E')).code).toBe(
    'INVALID_LENGTH'
  );
  expect(thrown<Base32KeyError>(() => toHexString('')).code).toBe(
    'INVALID_LENGTH'
  );
});

test('fromHexString >> INVALID_HEX', () => {
  const error = thrown<Base32KeyError>(() => fromHexString('xyz'));
  expect(error instanceof Base32KeyError).toBe(true);
  expect(error.code).toBe('INVALID_HEX');
});
