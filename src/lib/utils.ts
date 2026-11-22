const CRC5_TAB = [
  0, 5, 10, 15, 20, 17, 30, 27, 13, 8, 7, 2, 25, 28, 19, 22, 26, 31, 16, 21, 14,
  11, 4, 1, 23, 18, 29, 24, 3, 6, 9, 12,
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

const LOOKUP_TABLES = new Map<string, Int8Array>();

/** Maps a character code below 128 to its digit, or -1. */
function lookupTable(alphabet: string) {
  let table = LOOKUP_TABLES.get(alphabet);
  if (!table) {
    table = new Int8Array(128).fill(-1);
    for (let i = 0; i < alphabet.length; ++i) {
      table[alphabet.charCodeAt(i)] = i;
    }
    LOOKUP_TABLES.set(alphabet, table);
  }
  return table;
}

function baseDecode(numString: string, alphabet: string) {
  const table = lookupTable(alphabet);
  const numArray: number[] = new Array(numString.length);
  for (let i = 0; i < numString.length; ++i) {
    const code = numString.charCodeAt(i);
    const digit = code < 128 ? table[code] : -1;
    if (digit < 0) {
      return null;
    }
    numArray[i] = digit;
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
