import { formatInput, validate } from './decode';
import { DecodeOptions, resolveOptions } from './options';
import { BASE_32_DIGITS, BASE_32_DIGITS_LOWERCASE } from './utils';

// cspell: disable
/**
 * Characters people confuse when reading or typing a key. Each entry lists
 * what a typed character may have been meant as. Characters outside the
 * alphabet (0, O, 1, I or l) map to the alphabet's look-alikes.
 */
const LOOKALIKES: { readonly [c: string]: string } = {
  // uppercase alphabet
  '2': 'Zz',
  Z: '2',
  '5': 'Ss',
  S: '5',
  '8': 'B',
  B: '8',
  '6': 'Gb',
  G: '6C',
  C: 'G',
  U: 'VY',
  V: 'UY',
  Y: 'VU',
  M: 'N',
  N: 'M',
  '0': 'DQdq',
  O: 'DQ',
  '1': 'LJ7ij',
  I: 'LJ',
  // lowercase alphabet
  z: '2',
  s: '5',
  b: '6',
  g: '9q',
  q: 'g9',
  '9': 'gq',
  u: 'vy',
  v: 'uy',
  y: 'vu',
  m: 'n',
  n: 'm',
  o: 'dq',
  l: 'ij7',
  i: 'j',
  j: 'i',
};
// cspell: enable

/** Options for {@link suggest}. */
export interface SuggestOptions extends DecodeOptions {
  /** Most suggestions to return. Default `5`. */
  readonly limit?: number;
}

/** Corrections for one invalid group, best first. */
function groupCandidates(group: string, alphabet: string): string[] {
  const out: string[] = [];
  const add = (candidate: string) => {
    if (candidate !== group && !out.includes(candidate)) {
      out.push(candidate);
    }
  };
  // Two adjacent characters typed in the wrong order.
  for (let i = 0; i + 1 < group.length; ++i) {
    add(group.slice(0, i) + group[i + 1] + group[i] + group.slice(i + 2));
  }
  // A character misread as a look-alike.
  for (let i = 0; i < group.length; ++i) {
    for (const c of LOOKALIKES[group[i]] ?? '') {
      if (alphabet.includes(c)) {
        add(group.slice(0, i) + c + group.slice(i + 1));
      }
    }
  }
  return out;
}

// cspell: disable
/**
 * Suggest valid keys close to a mistyped one, for a "Did you mean …?" hint.
 *
 * Each invalid group is repaired by swapping two neighbouring characters,
 * replacing a look-alike character (2/Z, 5/S, 8/B, 6/G, U/V/Y, 0/O/D/Q,
 * 1/I/L/J …). Only groups that fail are
 * changed, and every suggestion passes {@link validate} with the same
 * options. Returns an empty array for a valid key or when nothing close is
 * found.
 *
 * ### Example
 * ```js
 * suggest('222TE-3ZZGN')
 * // => ['222ET-3ZZGN']
 * ```
 */
// cspell: enable
export function suggest(
  keyString: string,
  options: SuggestOptions = {}
): string[] {
  const { limit = 5, ...decodeOptions } = options;
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError(`limit must be a positive integer, got ${limit}`);
  }
  const resolved = resolveOptions(decodeOptions, true, true);
  const cases = resolved.autoCase
    ? (['upper', 'lower'] as const)
    : ([resolved.upperCase ? 'upper' : 'lower'] as const);
  const results: string[] = [];

  for (const keyCase of cases) {
    const opts = { ...decodeOptions, case: keyCase };
    const result = validate(keyString, opts);
    if (result.valid || result.code === 'INVALID_PREFIX') {
      if (result.valid) return [];
      continue;
    }
    const formatted = formatInput(keyString, { ...opts, groups: undefined });
    const prefix = resolved.prefix ? `${resolved.prefix}-` : '';
    const body = formatted.substring(prefix.length);
    const groups = resolved.grouped ? body.split('-') : [body];
    const alphabet =
      keyCase === 'upper' ? BASE_32_DIGITS : BASE_32_DIGITS_LOWERCASE;
    // Changing characters cannot add or remove groups.
    if (resolved.groups !== undefined && groups.length !== resolved.groups) {
      continue;
    }

    // Valid replacements for each invalid group.
    const options = result.invalidGroups.map((index) =>
      groupCandidates(groups[index], alphabet).filter(
        (candidate) =>
          validate(candidate, {
            ...opts,
            normalize: false,
            groups: undefined,
            prefix: undefined,
          }).valid
      )
    );
    if (options.some((list) => list.length === 0)) continue;

    // Combine them, closest (first candidates) first.
    const combine = (depth: number, parts: string[]) => {
      if (results.length >= limit) return;
      if (depth === options.length) {
        const fixed = [...groups];
        result.invalidGroups.forEach((index, k) => {
          fixed[index] = parts[k];
        });
        // Each group is valid now and the count is right, so the key is.
        results.push(prefix + fixed.join(resolved.grouped ? '-' : ''));
        return;
      }
      for (const candidate of options[depth]) {
        combine(depth + 1, [...parts, candidate]);
      }
    };
    combine(0, []);
  }
  return results.slice(0, limit);
}
