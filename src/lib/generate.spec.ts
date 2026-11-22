import test from 'ava';

import { fromBigInt, toBigInt } from './bigint';
import { toHexString, validate } from './decode';
import { Base32KeyError } from './errors';
import { generateKey } from './generate';

const counter = () => {
  let next = 0;
  return (length: number) => {
    const bytes = new Uint8Array(length);
    for (let i = 0; i < length; ++i) {
      bytes[i] = next++;
    }
    return bytes;
  };
};

// cspell: disable
test('generateKey >> deterministic with a custom random source', (t) => {
  const first = generateKey({ random: counter() });
  t.is(first, generateKey({ random: counter() }));
  t.is(first.replace(/(.)....(-|$)/g, '$1').length, 4);
  t.true(first.startsWith('2345'));
  const key = generateKey({ random: () => new Uint8Array(16) });
  t.is(key, '22222-22222-22222-22222');
  t.is(toHexString(key), '0');
});

test('generateKey >> shape follows the options', (t) => {
  const random = counter();
  t.regex(
    generateKey({ random }),
    /^([2-9A-HJ-NP-Z]{5}-){3}[2-9A-HJ-NP-Z]{5}$/
  );
  t.regex(generateKey({ random, groups: 2 }), /^[2-9A-Z]{5}-[2-9A-Z]{5}$/);
  t.regex(
    generateKey({ random, case: 'lower' }),
    /^([a-z2-9]{5}-){3}[a-z2-9]{5}$/
  );
  t.regex(
    generateKey({ random, checked: false }),
    /^([2-9A-Z]{4}-){3}[2-9A-Z]{4}$/
  );
  t.is(
    generateKey({ random: () => new Uint8Array(16), grouped: false }),
    '22222222222222222'
  );
  t.is(
    generateKey({
      random: () => new Uint8Array(20),
      checked: false,
      grouped: false,
      groups: 5,
    }).length,
    20
  );
});

test('generateKey >> masks random bytes to 5 bits', (t) => {
  const key = generateKey({
    random: (n) => new Uint8Array(n).fill(255),
    checked: false,
  });
  t.is(key, 'ZZZZ-ZZZZ-ZZZZ-ZZZZ');
});

test('generateKey >> keys are valid', (t) => {
  const random = counter();
  for (let i = 0; i < 20; ++i) {
    t.true(validate(generateKey({ random })).valid);
  }
});

test('generateKey >> filter', (t) => {
  let calls = 0;
  const key = generateKey({
    random: counter(),
    filter: () => ++calls === 3,
  });
  t.is(calls, 3);
  t.true(validate(key).valid);

  const error = t.throws<Base32KeyError>(() =>
    generateKey({ random: counter(), filter: () => false, maxAttempts: 5 })
  );
  t.is(error.code, 'GENERATION_FAILED');
});

test('generateKey >> rejects bad options', (t) => {
  t.throws(() => generateKey({ groups: 0 }), { instanceOf: RangeError });
  t.throws(() => generateKey({ groups: 1.5 }), { instanceOf: RangeError });
  t.throws(() => generateKey({ maxAttempts: 0 }), { instanceOf: RangeError });
  t.throws(() => generateKey({ random: () => new Uint8Array(3) }), {
    instanceOf: RangeError,
  });
  t.throws(
    () => generateKey({ random: () => (undefined as unknown) as Uint8Array }),
    { instanceOf: RangeError }
  );
});

test('generateKey >> default random source', (t) => {
  const crypto = (globalThis as { crypto?: unknown }).crypto;
  if (crypto) {
    const keys = new Set([generateKey(), generateKey(), generateKey()]);
    t.is(keys.size, 3);
  } else {
    t.is(
      t.throws<Base32KeyError>(() => generateKey()).code,
      'NO_RANDOM_SOURCE'
    );
  }
});

test('generateKey >> reports a missing random source', (t) => {
  const global = globalThis as { crypto?: unknown };
  const descriptor = Object.getOwnPropertyDescriptor(global, 'crypto');
  Object.defineProperty(global, 'crypto', {
    value: undefined,
    configurable: true,
  });
  try {
    t.is(
      t.throws<Base32KeyError>(() => generateKey()).code,
      'NO_RANDOM_SOURCE'
    );
  } finally {
    if (descriptor) {
      Object.defineProperty(global, 'crypto', descriptor);
    } else {
      delete global.crypto;
    }
  }
});

test('fromBigInt / toBigInt', (t) => {
  t.is(fromBigInt(BigInt(12648430)), '222ET-3ZZGN');
  t.is(fromBigInt(BigInt(0)), '22222');
  t.is(
    fromBigInt(BigInt(12648430), { grouped: false, case: 'lower' }),
    'nb99qj'
  );
  t.is(toBigInt('222ET-3ZZGN'), BigInt(12648430));
  t.is(toBigInt('222et 3zzgn', { normalize: true }), BigInt(12648430));
  const big = BigInt('0xfedcba9876543210');
  t.is(toBigInt(fromBigInt(big)), big);
  t.throws(() => fromBigInt(BigInt(-1)), { instanceOf: RangeError });
  t.throws(() => fromBigInt((5 as unknown) as bigint), {
    instanceOf: TypeError,
  });
});
