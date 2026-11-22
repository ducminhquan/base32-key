import { toHexString } from './decode';
import { fromHexString } from './encode';
import { DecodeOptions, EncodeOptions } from './options';

// cspell: disable
/**
 * Encode a non-negative BigInt as a Base32 key.
 *
 * @example `fromBigInt(BigInt(12648430))` returns `'222ET-3ZZGN'`.
 */
export function fromBigInt(value: bigint, options?: EncodeOptions): string {
  if (typeof value !== 'bigint') {
    throw new TypeError('Invalid: expected a bigint');
  }
  if (value < BigInt(0)) {
    throw new RangeError('Invalid: expected a non-negative bigint');
  }
  return fromHexString(value.toString(16), options);
}

/**
 * Decode a Base32 key to a BigInt.
 *
 * @example `toBigInt('222ET-3ZZGN')` returns `12648430n`.
 * @throws {@link Base32KeyError} like {@link toHexString}.
 */
export function toBigInt(keyString: string, options?: DecodeOptions): bigint {
  return BigInt(`0x${toHexString(keyString, options)}`);
}
