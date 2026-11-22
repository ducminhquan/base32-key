import { addPrefix } from './encode';
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

/** Options for {@link formatInput}. */
export interface FormatOptions extends EncodeOptions {
  /** Keep at most this many groups. Grouped keys only. */
  readonly groups?: number;
}

/** Result of {@link validate}. */
export interface ValidationResult {
  /** `true` when the whole key decodes and every check digit matches. */
  readonly valid: boolean;
  /** 0-based indexes of the groups that are invalid. */
  readonly invalidGroups: readonly number[];
  /** Reason of the first invalid group, when the key is invalid. */
  readonly code?: Base32KeyErrorCode;
}

/**
 * Removes the `prefix` option from the front of a key. Returns `undefined`
 * when the key does not start with it.
 */
function stripPrefix(keyString: string, options: ResolvedOptions) {
  const { prefix } = options;
  if (!prefix) {
    return keyString;
  }
  if (!options.normalize) {
    return keyString.startsWith(`${prefix}-`)
      ? keyString.substring(prefix.length + 1)
      : undefined;
  }
  const cleaned = keyString.replace(/^[\s-]+/, '');
  return cleaned.substring(0, prefix.length).toUpperCase() ===
    prefix.toUpperCase()
    ? cleaned.substring(prefix.length)
    : undefined;
}

interface Analysis {
  readonly hex: string;
  readonly invalidGroups: readonly number[];
  readonly code?: Base32KeyErrorCode;
  /** Set when `options.groups` is given and the key has another count. */
  readonly groupCount?: { readonly expected: number; readonly actual: number };
}

function analyzeWith(input: string, options: ResolvedOptions): Analysis {
  const keyString = stripPrefix(input, options);
  if (keyString === undefined) {
    return { hex: '', invalidGroups: [], code: 'INVALID_PREFIX' };
  }
  const groups = splitKey(keyString, options);
  const invalid = new Set<number>();
  let code: Base32KeyErrorCode | undefined;
  let hex = '';
  groups.forEach((group, index) => {
    const result = decodeGroup(group, options);
    if (result.ok) {
      hex += result.hex;
    } else {
      invalid.add(index);
      code = code || result.code;
    }
  });
  const expected = options.groups;
  if (expected === undefined || groups.length === expected) {
    return { hex, invalidGroups: [...invalid], code };
  }
  // Flag the missing groups, or the extra ones.
  const from = Math.min(groups.length, expected);
  const to = Math.max(groups.length, expected);
  for (let i = from; i < to; ++i) {
    invalid.add(i);
  }
  return {
    hex,
    invalidGroups: [...invalid].sort((a, b) => a - b),
    code: code || 'INVALID_LENGTH',
    groupCount: { expected, actual: groups.length },
  };
}

function analyze(keyString: string, options: ResolvedOptions): Analysis {
  const first = analyzeWith(keyString, options);
  if (!options.autoCase || first.code === undefined) {
    return first;
  }
  const other = analyzeWith(keyString, { ...options, upperCase: false });
  return other.code === undefined ||
    other.invalidGroups.length < first.invalidGroups.length
    ? other
    : first;
}

/**
 * Decodes and verifies a key, returning every data digit as hex, leading
 * zeroes included (5 hex digits per group).
 */
export function decodeToPaddedHex(
  keyString: unknown,
  options: ResolvedOptions
): string {
  if (typeof keyString !== 'string') {
    throw new TypeError('Invalid: expected a string');
  }
  const { hex, invalidGroups, code, groupCount } = analyze(keyString, options);
  if (code === 'INVALID_PREFIX') {
    throw new Base32KeyError(
      code,
      `Invalid key: expected the prefix "${options.prefix}"`
    );
  }
  if (groupCount) {
    throw new Base32KeyError(
      'INVALID_LENGTH',
      `Invalid key: expected ${groupCount.expected} groups, got ${groupCount.actual}`,
      invalidGroups
    );
  }
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
  return hex;
}

function decodeKey(keyString: unknown, options: ResolvedOptions) {
  const hex = decodeToPaddedHex(keyString, options);

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
 * @param options - Decoding options.
 * @returns Hex string without leading zeroes.
 * @throws {@link Base32KeyError} if the key is empty, malformed or fails a
 * checksum; its `invalidGroups` lists the groups at fault.
 */
// cspell: enable
export function toHexString(
  keyString: string,
  options?: DecodeOptions
): string {
  return decodeKey(keyString, resolveOptions(options, false, true));
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
  const resolved = resolveOptions(options, true, true);
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
 * With `groups`, input beyond that many groups is dropped, which suits an
 * input field with a fixed key length.
 *
 * ### Example
 * ```js
 * formatInput('222et3zz')
 * // => '222ET-3ZZ'
 * formatInput('222et3zzgn22', { groups: 2 })
 * // => '222ET-3ZZGN'
 * ```
 */
// cspell: enable
export function formatInput(raw: string, options: FormatOptions = {}): string {
  if (typeof raw !== 'string') {
    throw new TypeError('Invalid: expected a string');
  }
  const resolved = resolveOptions(options, true, true);
  const { prefix } = resolved;
  let rest = raw;
  if (prefix) {
    const cleaned = raw.replace(/[\s-]+/g, '').toUpperCase();
    if (prefix.toUpperCase().startsWith(cleaned)) {
      // Still typing the prefix.
      return cleaned;
    }
    rest = stripPrefix(raw, resolved) ?? raw;
  }
  const groups = splitKey(rest, resolved);
  const key = groups
    .slice(0, resolved.groups ?? groups.length)
    .join(resolved.grouped ? '-' : '');
  return addPrefix(key, prefix);
}
