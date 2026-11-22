import { Base32KeyError, Base32KeyErrorCode } from './errors';
import {
  DecodeOptions,
  EncodeOptions,
  ResolvedOptions,
  resolveOptions,
} from './options';
import {
  BASE_16_DIGITS,
  BASE_32_DIGITS,
  BASE_32_DIGITS_LOWERCASE,
  baseDecode,
  baseEncode,
  calculateCrc5,
} from './utils';

function base32toBase16(base32Numbers: number[]) {
  while (base32Numbers.length % 4 != 0) {
    base32Numbers.unshift(0);
  }
  const base16Numbers = [];
  for (let i = 0; i < base32Numbers.length; i += 4) {
    const word =
      (base32Numbers[i + 0] << 15) |
      (base32Numbers[i + 1] << 10) |
      (base32Numbers[i + 2] << 5) |
      (base32Numbers[i + 3] << 0);
    base16Numbers.push(
      (word >> 16) & 15,
      (word >> 12) & 15,
      (word >> 8) & 15,
      (word >> 4) & 15,
      (word >> 0) & 15
    );
  }
  return base16Numbers;
}

/** Splits a key into the groups that are decoded independently. */
export function splitKey(keyString: string, options: ResolvedOptions) {
  if (!options.normalize) {
    return keyString.split('-');
  }
  const cleaned = keyString.replace(/[\s-]+/g, '');
  const folded = options.upperCase
    ? cleaned.toUpperCase()
    : cleaned.toLowerCase();
  if (!options.grouped) {
    return [folded];
  }
  const size = options.checked ? 5 : 4;
  const groups = [];
  for (let i = 0; i < folded.length; i += size) {
    groups.push(folded.substring(i, i + size));
  }
  return groups.length > 0 ? groups : [''];
}

type GroupResult =
  | { readonly ok: true; readonly hex: string }
  | { readonly ok: false; readonly code: Base32KeyErrorCode };

function decodeGroup(group: string, options: ResolvedOptions): GroupResult {
  const alphabet = options.upperCase
    ? BASE_32_DIGITS
    : BASE_32_DIGITS_LOWERCASE;
  const base32num = baseDecode(group, alphabet);
  if (base32num == null) {
    return { ok: false, code: 'INVALID_CHARACTER' };
  }
  if (
    base32num.length === 0 ||
    (options.grouped && base32num.length != 4 + (options.checked ? 1 : 0))
  ) {
    return { ok: false, code: 'INVALID_LENGTH' };
  }
  if (options.checked) {
    // Remove and verify check digit.
    const check = base32num.pop();
    if (calculateCrc5(base32num) !== check) {
      return { ok: false, code: 'CHECKSUM_MISMATCH' };
    }
  }
  return {
    ok: true,
    hex: baseEncode(base32toBase16(base32num), BASE_16_DIGITS),
  };
}

const MESSAGES: { readonly [code in Base32KeyErrorCode]?: string } = {
  INVALID_CHARACTER: 'a character outside the alphabet',
  INVALID_LENGTH: 'the wrong length',
  CHECKSUM_MISMATCH: 'a check digit that does not match',
};

/** Result of {@link validate}. */
export interface ValidationResult {
  /** `true` when the whole key decodes and every check digit matches. */
  readonly valid: boolean;
  /** 0-based indexes of the groups that are invalid. */
  readonly invalidGroups: readonly number[];
  /** Reason of the first invalid group, when the key is invalid. */
  readonly code?: Base32KeyErrorCode;
}

function analyze(keyString: string, options: ResolvedOptions) {
  const groups = splitKey(keyString, options);
  const invalidGroups: number[] = [];
  let code: Base32KeyErrorCode | undefined;
  let hex = '';
  groups.forEach((group, index) => {
    const result = decodeGroup(group, options);
    if (result.ok) {
      hex += result.hex;
    } else {
      invalidGroups.push(index);
      code = code || result.code;
    }
  });
  return { hex, invalidGroups, code };
}

function decodeKey(keyString: unknown, options: ResolvedOptions) {
  if (typeof keyString !== 'string') {
    throw new TypeError('Invalid: expected a string');
  }
  const { hex, invalidGroups, code } = analyze(keyString, options);
  if (code !== undefined) {
    const where =
      invalidGroups.length === 1
        ? `group ${invalidGroups[0] + 1}`
        : `groups ${invalidGroups.map((i) => i + 1).join(', ')}`;
    throw new Base32KeyError(
      code,
      `Invalid key: ${where} ${invalidGroups.length === 1 ? 'has' : 'have'} ${
        MESSAGES[code]
      }`,
      invalidGroups
    );
  }

  // Trim leading zeroes from result.
  let i = 0;
  const zero = BASE_16_DIGITS.charAt(0);
  while (i < hex.length - 1 && hex.charAt(i) === zero) {
    ++i;
  }
  // A key that encodes the value zero may carry no data digits at all
  // (e.g. the key "2" without groups but with a checksum), which decodes to "".
  return hex.substring(i) || zero;
}

// cspell: disable

/**
 * Decode a Base32 key to a hex string.
 *
 * ### Example
 * ```js
 * import { toHexString } from 'base32-key'
 * toHexString('222ET-3ZZGN')
 * // => 'c0ffee'
 * toHexString('222et 3zzgn', { normalize: true })
 * // => 'c0ffee'
 * ```
 *
 * @param keyString - Input Base32 key.
 * @param options - Decoding options, or the legacy `grouped` boolean.
 * @returns Hex string without leading zeroes.
 * @throws {@link Base32KeyError} if the key is empty, malformed or fails a
 * checksum; its `invalidGroups` lists the groups at fault.
 */
// cspell: enable
export function toHexString(keyString: string, options?: DecodeOptions): string;
/**
 * @deprecated Pass an options object instead of positional booleans.
 * @param keyString - Input Base32 key.
 * @param grouped - The key is split into groups.
 * @param checked - The key includes check digits.
 * @param upperCase - The key uses the uppercase alphabet.
 */
export function toHexString(
  keyString: string,
  grouped?: boolean,
  checked?: boolean,
  upperCase?: boolean
): string;
export function toHexString(keyString: string, ...args: unknown[]): string {
  return decodeKey(keyString, resolveOptions(args));
}

// cspell: disable
/**
 * Check a key without throwing, for example while the user is typing.
 *
 * Input is normalized by default (whitespace, letter case and hyphen
 * placement are ignored); pass `normalize: false` to check it as is.
 *
 * ### Example
 * ```js
 * validate('222ET-3ZZGX')
 * // => { valid: false, invalidGroups: [1], code: 'CHECKSUM_MISMATCH' }
 * ```
 */
// cspell: enable
export function validate(
  keyString: string,
  options: DecodeOptions = {}
): ValidationResult {
  if (typeof keyString !== 'string') {
    throw new TypeError('Invalid: expected a string');
  }
  const resolved = resolveOptions([options], true);
  const { invalidGroups, code } = analyze(keyString, resolved);
  return code === undefined
    ? { valid: true, invalidGroups }
    : { valid: false, invalidGroups, code };
}

// cspell: disable
/**
 * Format raw user input as a key: drops whitespace, applies the alphabet's
 * letter case and inserts hyphens between groups. Partial input is fine.
 * Characters outside the alphabet are kept so `validate` can flag them.
 *
 * ### Example
 * ```js
 * formatInput('222et3zz')
 * // => '222ET-3ZZ'
 * ```
 */
// cspell: enable
export function formatInput(raw: string, options: EncodeOptions = {}): string {
  if (typeof raw !== 'string') {
    throw new TypeError('Invalid: expected a string');
  }
  const resolved = resolveOptions([options], true);
  return splitKey(raw, resolved).join(resolved.grouped ? '-' : '');
}
