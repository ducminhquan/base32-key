import { Base32KeyError } from './errors';
import { EncodeOptions, resolveOptions } from './options';
import {
  BASE_16_DIGITS,
  BASE_32_DIGITS,
  BASE_32_DIGITS_LOWERCASE,
  baseDecode,
  baseEncode,
  calculateCrc5,
} from './utils';

function parseHexString(base16String: string) {
  if (typeof base16String !== 'string') {
    throw new TypeError('Invalid hex string: expected a string');
  }
  const hex = /^0x/i.test(base16String)
    ? base16String.substring(2)
    : base16String;
  const base16Numbers = baseDecode(hex.toLowerCase(), BASE_16_DIGITS);
  if (base16Numbers == null || base16Numbers.length === 0) {
    throw new Base32KeyError(
      'INVALID_HEX',
      `Invalid hex string: "${base16String}"`
    );
  }
  return base16Numbers;
}

export function encodeBase32(
  base32Numbers: number[],
  grouped: boolean,
  checked: boolean,
  upperCase: boolean,
  keepLeadingZeros = false
) {
  const digits = upperCase ? BASE_32_DIGITS : BASE_32_DIGITS_LOWERCASE;
  if (grouped) {
    // This assumes base32num.length is a multiple of 4.
    const groups = [];
    for (let i = 0; i < base32Numbers.length; i += 4) {
      const groupNum = base32Numbers.slice(i, i + 4);
      if (checked) {
        groupNum.push(calculateCrc5(groupNum));
      }
      groups.push(baseEncode(groupNum, digits));
    }
    return groups.join('-');
  } else {
    if (checked) {
      base32Numbers.push(calculateCrc5(base32Numbers));
    }
    let i = 0;
    while (
      !keepLeadingZeros &&
      i + 1 < base32Numbers.length &&
      base32Numbers[i] == 0
    ) {
      ++i;
    }
    return baseEncode(base32Numbers.slice(i), digits);
  }
}

function numberToBase32(input: readonly number[]) {
  const base16Numbers = input.concat([]);

  while (base16Numbers.length % 5 != 0) {
    base16Numbers.unshift(0);
  }

  const base32num = [];

  for (let i = 0; i < base16Numbers.length; i += 5) {
    const word =
      (base16Numbers[i + 0] << 16) |
      (base16Numbers[i + 1] << 12) |
      (base16Numbers[i + 2] << 8) |
      (base16Numbers[i + 3] << 4) |
      (base16Numbers[i + 4] << 0);
    base32num.push((word >> 15) & 31);
    base32num.push((word >> 10) & 31);
    base32num.push((word >> 5) & 31);
    base32num.push((word >> 0) & 31);
  }

  return base32num;
}

// cspell: disable
/**
 * Encode a hex string as a Base32 key.
 *
 * ### Example
 * ```js
 * import { fromHexString } from 'base32-key'
 * fromHexString('c0ffee')
 * // => '222ET-3ZZGN'
 * fromHexString('c0ffee', { grouped: false, case: 'lower' })
 * // => 'nb99qj'
 * ```
 *
 * @param base16String - Input hex string (an optional `0x` prefix is allowed).
 * @param options - Encoding options, or the legacy `grouped` boolean.
 * @returns Base32 key.
 * @throws {@link Base32KeyError} with code `INVALID_HEX` if `base16String` is
 * empty or contains non-hex characters.
 */
// cspell: enable
export function fromHexString(
  base16String: string,
  options?: EncodeOptions
): string;
/**
 * @deprecated Pass an options object instead of positional booleans.
 * @param base16String - Input hex string.
 * @param grouped - Split the key into groups.
 * @param checked - Add check digits.
 * @param upperCase - Use the uppercase alphabet.
 */
export function fromHexString(
  base16String: string,
  grouped?: boolean,
  checked?: boolean,
  upperCase?: boolean
): string;
export function fromHexString(
  base16String: string,
  ...args: unknown[]
): string {
  const { grouped, checked, upperCase } = resolveOptions(args);
  const base16Numbers = parseHexString(base16String);
  const base32Numbers = numberToBase32(base16Numbers);
  return encodeBase32(base32Numbers, grouped, checked, upperCase);
}
