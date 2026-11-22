import { decodeToPaddedHex, toHexString } from './decode';
import { fromHexString } from './encode';
import { Base32KeyError } from './errors';
import { DecodeOptions, EncodeOptions, resolveOptions } from './options';

/** Options for {@link fromBytes}. */
export interface BytesEncodeOptions extends EncodeOptions {
  /**
   * Prefix the key with one group that stores the byte length, so
   * {@link toBytes} restores leading zero bytes exactly and detects keys that
   * were cut short. Requires grouped keys. Default `false`.
   */
  readonly withLength?: boolean;
}

/** Options for {@link toBytes}. */
export interface BytesDecodeOptions extends DecodeOptions {
  /** The key was made with `fromBytes(bytes, { withLength: true })`. */
  readonly withLength?: boolean;
  /**
   * Left-pad the result with zero bytes to this length. Throws
   * `INVALID_LENGTH` if the value needs more bytes. Ignored with `withLength`.
   */
  readonly length?: number;
}

/** Largest byte length a `withLength` key can store (20 bits). */
export const MAX_LENGTH_PREFIXED_BYTES = 0xfffff;

const HEX_DIGITS = '0123456789abcdef';

function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (const byte of bytes) {
    hex += HEX_DIGITS[byte >> 4] + HEX_DIGITS[byte & 15];
  }
  return hex;
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; ++i) {
    bytes[i] = parseInt(hex.substring(2 * i, 2 * i + 2), 16);
  }
  return bytes;
}

function requireGrouped(grouped: boolean) {
  if (!grouped) {
    throw new TypeError('withLength requires grouped keys');
  }
}

// cspell: disable
/**
 * Encode bytes as a Base32 key.
 *
 * ### Example
 * ```js
 * fromBytes(new Uint8Array([0xc0, 0xff, 0xee]))
 * // => '222ET-3ZZGN'
 * fromBytes(new Uint8Array([0, 0xff]), { withLength: true })
 * // => '2224C-229ZN'  (the first group stores the length: 2 bytes)
 * ```
 *
 * Without `withLength`, leading zero bytes are not kept: decode with
 * `toBytes(key, { length })` when the length is fixed and known.
 *
 * @throws RangeError for empty input without `withLength`, or input longer
 * than {@link MAX_LENGTH_PREFIXED_BYTES} with it.
 */
// cspell: enable
export function fromBytes(
  bytes: Uint8Array,
  options: BytesEncodeOptions = {}
): string {
  if (!(bytes instanceof Uint8Array)) {
    throw new TypeError('Invalid: expected a Uint8Array');
  }
  const hex = bytesToHex(bytes);
  if (!options.withLength) {
    if (bytes.length === 0) {
      throw new RangeError('Cannot encode empty bytes without withLength');
    }
    return fromHexString(hex, options);
  }
  requireGrouped(resolveOptions(options).grouped);
  if (bytes.length > MAX_LENGTH_PREFIXED_BYTES) {
    throw new RangeError(
      `withLength supports at most ${MAX_LENGTH_PREFIXED_BYTES} bytes`
    );
  }
  const lengthHex = bytes.length.toString(16).padStart(5, '0');
  const dataHex = hex.padStart(Math.ceil(hex.length / 5) * 5, '0');
  return fromHexString(lengthHex + dataHex, options);
}

// cspell: disable
/**
 * Decode a Base32 key to bytes.
 *
 * ### Example
 * ```js
 * toBytes('222ET-3ZZGN')
 * // => Uint8Array [0xc0, 0xff, 0xee]
 * toBytes('222ET-3ZZGN', { length: 4 })
 * // => Uint8Array [0x00, 0xc0, 0xff, 0xee]
 * ```
 *
 * @throws {@link Base32KeyError} like {@link toHexString}; with `withLength`
 * also `INVALID_LENGTH` when groups are missing or extra.
 */
// cspell: enable
export function toBytes(
  keyString: string,
  options: BytesDecodeOptions = {}
): Uint8Array {
  if (options.withLength) {
    const resolved = resolveOptions(options, false, true);
    requireGrouped(resolved.grouped);
    const hex = decodeToPaddedHex(keyString, resolved);
    const length = parseInt(hex.substring(0, 5), 16);
    const data = hex.substring(5);
    const expected = Math.ceil((length * 2) / 5) * 5;
    const padding = data.substring(0, expected - length * 2);
    if (data.length !== expected || /[^0]/.test(padding)) {
      throw new Base32KeyError(
        'INVALID_LENGTH',
        `Invalid key: a ${length}-byte value needs ${expected / 5 + 1} groups, got ${hex.length / 5}`
      );
    }
    return hexToBytes(data.substring(padding.length));
  }

  let hex = toHexString(keyString, options);
  if (hex.length % 2 === 1) {
    hex = `0${hex}`;
  }
  let bytes = hexToBytes(hex);
  if (options.length === undefined) {
    return bytes;
  }
  const { length } = options;
  if (!Number.isInteger(length) || length < 0) {
    throw new RangeError(
      `length must be a non-negative integer, got ${length}`
    );
  }
  if (bytes.length === 1 && bytes[0] === 0) {
    bytes = new Uint8Array(0);
  }
  if (bytes.length > length) {
    throw new Base32KeyError(
      'INVALID_LENGTH',
      `Invalid key: the value needs ${bytes.length} bytes, more than ${length}`
    );
  }
  const padded = new Uint8Array(length);
  padded.set(bytes, length - bytes.length);
  return padded;
}
