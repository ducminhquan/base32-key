import { expect, test } from 'vitest';

import { keySchema } from './schema';

// cspell: disable
const check = (value: unknown, options = {}) =>
  keySchema(options)['~standard'].validate(value);

test('keySchema >> accepts and formats a valid key', () => {
  const schema = keySchema();
  expect(schema['~standard'].version).toBe(1);
  expect(schema['~standard'].vendor).toBe('base32-key');
  expect(check('222et 3zzgn')).toEqual({ value: '222ET-3ZZGN' });
  expect(check('aaan3zw9i8wfewh', { case: 'auto' })).toEqual({
    value: 'aaan3-zw9i8-wfewh',
  });
  expect(check('222et3zzgn', { case: 'auto' })).toEqual({
    value: '222ET-3ZZGN',
  });
  expect(check('aaan3zw9i8wfewh', { case: 'lower' })).toEqual({
    value: 'aaan3-zw9i8-wfewh',
  });
  expect(check('lc222et3zzgn', { prefix: 'LC', groups: 2 })).toEqual({
    value: 'LC-222ET-3ZZGN',
  });
});

test('keySchema >> explains what is wrong', () => {
  const message = (value: unknown, options = {}) => {
    const result = check(value, options);
    return 'issues' in result ? result.issues?.[0].message : undefined;
  };
  expect(message(42)).toBe('Expected a string');
  expect(message('222ET-3ZZGX')).toBe('Group 2 has a typo');
  expect(message('222EX-3ZZGX')).toBe('Groups 1, 2 have a typo');
  expect(message('222ET-3ZZG0')).toBe(
    'Group 2 has a character that is not allowed'
  );
  expect(message('222ET-3ZZG')).toBe('Group 2 has the wrong length');
  expect(message('222ET', { groups: 2 })).toBe('Enter all 2 groups of the key');
  expect(message('222ET-3ZZGN-22222', { groups: 2 })).toBe(
    'The key has more than 2 groups'
  );
  expect(message('222ET-3ZZ', { groups: 2 })).toBe(
    'Group 2 has the wrong length'
  );
  expect(message('LC-222ET', { prefix: 'LC', groups: 2 })).toBe(
    'Enter all 2 groups of the key'
  );
  expect(message('XX-222ET-3ZZGN', { prefix: 'LC' })).toBe(
    'The key must start with LC'
  );
});
