import { expect, test } from 'vitest';

import { thrown } from '../test/thrown';

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
test('generateKey >> deterministic with a custom random source', () => {
  const first = generateKey({ random: counter() });
  expect(first).toBe(generateKey({ random: counter() }));
  expect(first.replace(/(.)....(-|$)/g, '$1').length).toBe(4);
  expect(first.startsWith('2345')).toBe(true);
  const key = generateKey({ random: () => new Uint8Array(16) });
  expect(key).toBe('22222-22222-22222-22222');
  expect(toHexString(key)).toBe('0');
});

test('generateKey >> shape follows the options', () => {
  const random = counter();
  expect(generateKey({ random })).toMatch(
    /^([2-9A-HJ-NP-Z]{5}-){3}[2-9A-HJ-NP-Z]{5}$/
  );
  expect(generateKey({ random, groups: 2 })).toMatch(
    /^[2-9A-Z]{5}-[2-9A-Z]{5}$/
  );
  expect(generateKey({ random, case: 'lower' })).toMatch(
    /^([a-z2-9]{5}-){3}[a-z2-9]{5}$/
  );
  expect(generateKey({ random, checked: false })).toMatch(
    /^([2-9A-Z]{4}-){3}[2-9A-Z]{4}$/
  );
  expect(
    generateKey({ random: () => new Uint8Array(16), grouped: false })
  ).toBe('22222222222222222');
  expect(
    generateKey({
      random: () => new Uint8Array(20),
      checked: false,
      grouped: false,
      groups: 5,
    }).length
  ).toBe(20);
});

test('generateKey >> masks random bytes to 5 bits', () => {
  const key = generateKey({
    random: (n) => new Uint8Array(n).fill(255),
    checked: false,
  });
  expect(key).toBe('ZZZZ-ZZZZ-ZZZZ-ZZZZ');
});

test('generateKey >> keys are valid', () => {
  const random = counter();
  for (let i = 0; i < 20; ++i) {
    expect(validate(generateKey({ random })).valid).toBe(true);
  }
});

test('generateKey >> filter', () => {
  let calls = 0;
  const key = generateKey({
    random: counter(),
    filter: () => ++calls === 3,
  });
  expect(calls).toBe(3);
  expect(validate(key).valid).toBe(true);

  const error = thrown<Base32KeyError>(() =>
    generateKey({ random: counter(), filter: () => false, maxAttempts: 5 })
  );
  expect(error.code).toBe('GENERATION_FAILED');
});

test('generateKey >> rejects bad options', () => {
  expect(() => generateKey({ groups: 0 })).toThrow(RangeError);
  expect(() => generateKey({ groups: 1.5 })).toThrow(RangeError);
  expect(() => generateKey({ maxAttempts: 0 })).toThrow(RangeError);
  expect(() => generateKey({ random: () => new Uint8Array(3) })).toThrow(
    RangeError
  );
  expect(() =>
    generateKey({ random: () => undefined as unknown as Uint8Array })
  ).toThrow(RangeError);
});

test('generateKey >> default random source', () => {
  const crypto = (globalThis as { crypto?: unknown }).crypto;
  if (crypto) {
    const keys = new Set([generateKey(), generateKey(), generateKey()]);
    expect(keys.size).toBe(3);
  } else {
    expect(thrown<Base32KeyError>(() => generateKey()).code).toBe(
      'NO_RANDOM_SOURCE'
    );
  }
});

const withGlobalCrypto = (value: unknown, run: () => void) => {
  const global = globalThis as { crypto?: unknown };
  const descriptor = Object.getOwnPropertyDescriptor(global, 'crypto');
  Object.defineProperty(global, 'crypto', { value, configurable: true });
  try {
    run();
  } finally {
    if (descriptor) {
      Object.defineProperty(global, 'crypto', descriptor);
    } else {
      delete global.crypto;
    }
  }
};

test('generateKey >> reports a missing random source', () => {
  withGlobalCrypto(undefined, () => {
    expect(thrown<Base32KeyError>(() => generateKey()).code).toBe(
      'NO_RANDOM_SOURCE'
    );
  });
  withGlobalCrypto({}, () => {
    expect(thrown<Base32KeyError>(() => generateKey()).code).toBe(
      'NO_RANDOM_SOURCE'
    );
  });
});

test('generateKey >> uses globalThis.crypto by default', () => {
  const calls: number[] = [];
  const fake = {
    getRandomValues(array: Uint8Array) {
      calls.push(array.length);
      return array.fill(255);
    },
  };
  withGlobalCrypto(fake, () => {
    expect(generateKey({ checked: false, groups: 2 })).toBe('ZZZZ-ZZZZ');
  });
  expect(calls).toEqual([8]);
});

test('fromBigInt / toBigInt', () => {
  expect(fromBigInt(BigInt(12648430))).toBe('222ET-3ZZGN');
  expect(fromBigInt(BigInt(0))).toBe('22222');
  expect(fromBigInt(BigInt(12648430), { grouped: false, case: 'lower' })).toBe(
    'nb99qj'
  );
  expect(toBigInt('222ET-3ZZGN')).toBe(BigInt(12648430));
  expect(toBigInt('222et 3zzgn', { normalize: true })).toBe(BigInt(12648430));
  const big = BigInt('0xfedcba9876543210');
  expect(toBigInt(fromBigInt(big))).toBe(big);
  expect(() => fromBigInt(BigInt(-1))).toThrow(RangeError);
  expect(() => fromBigInt(5 as unknown as bigint)).toThrow(TypeError);
});
