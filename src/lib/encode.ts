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
    throw new Error(`Invalid hex string: "${base16String}"`);
  }
  return base16Numbers;
}

function encodeBase32(
  base32Numbers: number[],
  grouped: boolean,
  checked: boolean,
  upperCase: boolean
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
    while (i + 1 < base32Numbers.length && base32Numbers[i] == 0) {
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
 * Encode Base32 key from HexString
 *
 * ### Example (es module)
 * ```js
 * import { fromHexString } from 'base32-key'
 * console.log(fromHexString('c0ffee'))
 * // => '222ET-3ZZGN'
 * ```
 *
 * ### Example (commonjs)
 * ```js
 * var fromHexString = require('base32-key').fromHexString;
 * console.log(fromHexString('c0ffee'))
 * // => '222ET-3ZZGN'
 * ```
 *
 * @param base16String - Input HexString (an optional `0x` prefix is allowed).
 * @param grouped - Split the result into groups.
 * @param checked - Include the checksum into Base32-Key.
 * @param upperCase - Use uppercase or lowercase Base32-Key.
 * @returns Base32-Key string.
 * @throws Error if `base16String` is empty or contains non-hex characters.
 */

// cspell: enable
export const fromHexString = (
  base16String: string,
  grouped = true,
  checked = true,
  upperCase = true
): string => {
  const base16Numbers = parseHexString(base16String);
  const base32Numbers = numberToBase32(base16Numbers);
  const result = encodeBase32(base32Numbers, grouped, checked, upperCase);
  return result;
};
