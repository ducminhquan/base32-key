/** Letter case of the Base32 alphabet. */
export type KeyCase = 'upper' | 'lower';

/** Options for encoding a key. */
export interface EncodeOptions {
  /** Split the key into hyphen-separated groups of 4 data digits. Default `true`. */
  readonly grouped?: boolean;
  /** Add a CRC-5 check digit (per group when grouped). Default `true`. */
  readonly checked?: boolean;
  /** Alphabet to use. Default `'upper'`. */
  readonly case?: KeyCase;
  /**
   * Letters or digits put in front of the key, joined with a hyphen, e.g.
   * `'LC'` gives `LC-222ET-3ZZGN`. Decoding then requires the same prefix
   * and removes it.
   */
  readonly prefix?: string;
}

/** Options for decoding or validating a key. */
export interface DecodeOptions extends Omit<EncodeOptions, 'case'> {
  /**
   * Alphabet the key uses. Default `'upper'`. `'auto'` tries both alphabets
   * and keeps the one whose check digits match (uppercase wins a tie).
   */
  readonly case?: KeyCase | 'auto';
  /**
   * Clean up user input before decoding: ignore whitespace, accept letters in
   * either case and, for grouped keys, accept missing or misplaced hyphens.
   * Default `false` for `toHexString`/`toBigInt`, `true` for `validate`.
   */
  readonly normalize?: boolean;
  /**
   * Exact number of groups the key must have, e.g. `4` for 80-bit product
   * keys. A key with fewer or more groups is invalid (`INVALID_LENGTH`).
   * Grouped keys only. Default: any number of groups.
   */
  readonly groups?: number;
}

export interface ResolvedOptions {
  readonly grouped: boolean;
  readonly checked: boolean;
  readonly upperCase: boolean;
  /** Try the other alphabet too (`case: 'auto'`). */
  readonly autoCase: boolean;
  readonly normalize: boolean;
  /** Required number of groups, if any. */
  readonly groups?: number;
  readonly prefix?: string;
}

function resolveCase(value: unknown, decoding: boolean) {
  if (value === undefined || value === 'upper') {
    return { upperCase: true, autoCase: false };
  }
  if (value === 'lower') {
    return { upperCase: false, autoCase: false };
  }
  if (value === 'auto' && decoding) {
    return { upperCase: true, autoCase: true };
  }
  throw new TypeError(`Invalid case option: ${String(value)}`);
}

function resolveGroups(value: unknown, grouped: boolean, decoding: boolean) {
  if (value === undefined || !decoding) {
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new RangeError(`groups must be a positive integer, got ${value}`);
  }
  if (!grouped) {
    throw new TypeError('The groups option requires grouped keys');
  }
  return value;
}

function resolvePrefix(value: unknown) {
  if (value === undefined || value === '') {
    return undefined;
  }
  if (typeof value !== 'string' || !/^[A-Za-z0-9]+$/.test(value)) {
    throw new TypeError(
      `prefix must be letters and digits only, got ${String(value)}`
    );
  }
  return value;
}

const POSITIONAL_REMOVED =
  'Positional boolean arguments were removed in base32-key 3.0: pass an options object, e.g. { grouped: false, checked: true, case: "lower" }';

/**
 * Reads an options object. `decoding` allows the decode-only options
 * (`case: 'auto'`, `groups`).
 */
export function resolveOptions(
  value: unknown,
  normalizeByDefault = false,
  decoding = false
): ResolvedOptions {
  if (value !== undefined && (typeof value !== 'object' || value === null)) {
    throw new TypeError(POSITIONAL_REMOVED);
  }
  const options = (value ?? {}) as DecodeOptions;
  const grouped = options.grouped !== false;
  return {
    grouped,
    checked: options.checked !== false,
    ...resolveCase(options.case, decoding),
    normalize:
      options.normalize === undefined ? normalizeByDefault : options.normalize,
    groups: resolveGroups(options.groups, grouped, decoding),
    prefix: resolvePrefix(options.prefix),
  };
}
