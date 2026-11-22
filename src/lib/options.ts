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
}

/** Options for decoding or validating a key. */
export interface DecodeOptions extends EncodeOptions {
  /**
   * Clean up user input before decoding: ignore whitespace, accept letters in
   * either case and, for grouped keys, accept missing or misplaced hyphens.
   * Default `false` for `toHexString`/`toBigInt`, `true` for `validate`.
   */
  readonly normalize?: boolean;
}

export interface ResolvedOptions {
  readonly grouped: boolean;
  readonly checked: boolean;
  readonly upperCase: boolean;
  readonly normalize: boolean;
}

function resolveCase(value: unknown): boolean {
  if (value === undefined || value === 'upper') {
    return true;
  }
  if (value === 'lower') {
    return false;
  }
  throw new TypeError(`Invalid case option: ${String(value)}`);
}

/** Reads either an options object or the legacy positional booleans. */
export function resolveOptions(
  args: readonly unknown[],
  normalizeByDefault = false
): ResolvedOptions {
  const [first, checked, upperCase] = args;
  if (typeof first === 'object' && first !== null) {
    const options = first as DecodeOptions;
    return {
      grouped: options.grouped !== false,
      checked: options.checked !== false,
      upperCase: resolveCase(options.case),
      normalize:
        options.normalize === undefined
          ? normalizeByDefault
          : options.normalize,
    };
  }
  return {
    grouped: first !== false,
    checked: checked !== false,
    upperCase: upperCase !== false,
    normalize: normalizeByDefault,
  };
}
