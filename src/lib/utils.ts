const CRC5_TAB = [
  0,
  5,
  10,
  15,
  20,
  17,
  30,
  27,
  13,
  8,
  7,
  2,
  25,
  28,
  19,
  22,
  26,
  31,
  16,
  21,
  14,
  11,
  4,
  1,
  23,
  18,
  29,
  24,
  3,
  6,
  9,
  12,
];

// cspell:disable
const BASE_32_DIGITS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const BASE_32_DIGITS_LOWERCASE = 'abcdefghijkmnpqrstuvwxyz23456789';
const BASE_16_DIGITS = '0123456789abcdef';
// cspell:enable

function calculateCrc5(base32Number: number[]) {
  let crc = 0;
  for (const digit of base32Number) {
    crc = CRC5_TAB[digit ^ crc];
  }
  return crc;
}

function baseEncode(numArray: readonly number[], alphabet: string) {
  return numArray.map(alphabet.charAt.bind(alphabet)).join('');
}

function baseDecode(numString: string, alphabet: string) {
  const numArray: number[] = [];
  for (let i = 0; i < numString.length; ++i) {
    const digit = alphabet.indexOf(numString.charAt(i));
    if (digit < 0) {
      return null;
    }
    numArray.push(digit);
  }
  return numArray;
}

export {
  calculateCrc5,
  BASE_32_DIGITS,
  BASE_32_DIGITS_LOWERCASE,
  BASE_16_DIGITS,
  baseEncode,
  baseDecode,
};
