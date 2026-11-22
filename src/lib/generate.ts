import { encodeBase32 } from './encode';
import { Base32KeyError } from './errors';
import { EncodeOptions, resolveOptions } from './options';

/** Options for {@link generateKey}. */
export interface GenerateOptions extends EncodeOptions {
  /** Number of 20-bit groups (4 data digits each). Default `4` (80 bits). */
  readonly groups?: number;
  /**
   * Return `false` to reject a candidate key, e.g. one that contains an
   * offensive word or already exists in your database.
   */
  readonly filter?: (key: string) => boolean;
  /** Candidates to try before giving up. Default `100`. */
  readonly maxAttempts?: number;
  /**
   * Source of random bytes. Defaults to `crypto.getRandomValues`, which is
   * available in browsers and Node.js 19+. Must return `length` bytes.
   */
  readonly random?: (length: number) => Uint8Array;
}

interface CryptoLike {
  getRandomValues(array: Uint8Array): Uint8Array;
}

function defaultRandom(length: number): Uint8Array {
  const crypto = (globalThis as { crypto?: CryptoLike }).crypto;
  if (!crypto || typeof crypto.getRandomValues !== 'function') {
    throw new Base32KeyError(
      'NO_RANDOM_SOURCE',
      'No secure random source: pass the `random` option, e.g. (n) => require("crypto").randomBytes(n)'
    );
  }
  return crypto.getRandomValues(new Uint8Array(length));
}

// cspell: disable
/**
 * Generate a random key, for example a product key or a voucher code.
 *
 * ### Example
 * ```js
 * generateKey()
 * // => e.g. 'K7RQX-2HMTD-9WCJA-PNE4F' (80 random bits)
 * generateKey({ groups: 3, filter: (key) => !blocklist.has(key) })
 * ```
 *
 * Keys always have the same length: `groups` groups of 5 characters (4 when
 * `checked` is `false`), or the same digits without hyphens when `grouped`
 * is `false`.
 *
 * @throws {@link Base32KeyError} with code `GENERATION_FAILED` when
 * `filter` rejects `maxAttempts` candidates in a row.
 */
// cspell: enable
export function generateKey(options: GenerateOptions = {}): string {
  const {
    groups = 4,
    filter,
    maxAttempts = 100,
    random = defaultRandom,
  } = options;
  if (!Number.isInteger(groups) || groups < 1) {
    throw new RangeError(`groups must be a positive integer, got ${groups}`);
  }
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new RangeError(
      `maxAttempts must be a positive integer, got ${maxAttempts}`
    );
  }
  const { grouped, checked, upperCase } = resolveOptions([options]);
  const digitCount = groups * 4;
  for (let attempt = 0; attempt < maxAttempts; ++attempt) {
    const bytes = random(digitCount);
    if (!bytes || bytes.length < digitCount) {
      throw new RangeError(`random must return ${digitCount} bytes`);
    }
    // 256 is a multiple of 32, so masking keeps the digits uniform.
    const digits = Array.from(bytes.slice(0, digitCount), (b) => b & 31);
    const key = encodeBase32(digits, grouped, checked, upperCase, true);
    if (!filter || filter(key)) {
      return key;
    }
  }
  throw new Base32KeyError(
    'GENERATION_FAILED',
    `No key accepted by filter after ${maxAttempts} attempts`
  );
}
