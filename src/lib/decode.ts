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

function decode(
  keyString: string,
  grouped: boolean,
  checked: boolean,
  upperCase: boolean
) {
  const digits = upperCase ? BASE_32_DIGITS : BASE_32_DIGITS_LOWERCASE;
  const base32num = baseDecode(keyString, digits);
  if (
    base32num == null ||
    (grouped && base32num.length != 4 + (checked ? 1 : 0))
  ) {
    throw new Error('Invalid');
  }
  if (checked) {
    // Remove and verify check digit.
    const check = base32num.pop();
    if (calculateCrc5(base32num) !== check) {
      throw new Error('Invalid');
    }
  }
  return baseEncode(base32toBase16(base32num), BASE_16_DIGITS);
}

/**
 * Decode Base32 key to HexString
 *
 * ### Example (es module)
 * ```js
 * import { fromHexString } from 'base32-key'
 * console.log(fromHexString('c0ffee'))
 * // => 8
 * ```
 *
 * ### Example (commonjs)
 * ```js
 * var double = require('base32-key').fromHexString;
 * console.log(fromHexString('c0ffee'))
 * // => 8
 * ```
 *
 * @param base16String - Input HexString.
 * @param grouped - Split the result into groups.
 * @param checked - Include the checksum into Base32-Key.
 * @param upperCase - Use uppercase or lowercase Base32-Key.
 * @returns Base32-Key string.
 * @anotherNote Some other value.
 */
export const toHexString = (
  keyString: string,
  grouped = true,
  checked = true,
  upperCase = true
): string => {
  const result = keyString
    .split('-')
    .map((k) => decode(k, grouped, checked, upperCase))
    .join('');

  // Trim leading zeroes from result.
  let i = 0;
  const zero = BASE_16_DIGITS.charAt(0);
  while (i < result.length - 1 && result.charAt(i) === zero) {
    ++i;
  }
  return result.substring(i);
};
