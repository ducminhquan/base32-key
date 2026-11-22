/**
 * Machine-readable reason for a {@link Base32KeyError}.
 *
 * - `INVALID_HEX`: the hex input is empty or contains non-hex characters.
 * - `INVALID_CHARACTER`: a group contains a character outside the alphabet.
 * - `INVALID_LENGTH`: the key, or one of its groups, has the wrong length.
 * - `CHECKSUM_MISMATCH`: a group's check digit does not match its data.
 * - `INVALID_PREFIX`: the key does not start with the expected `prefix`.
 * - `GENERATION_FAILED`: `generateKey` found no key accepted by the filter.
 * - `NO_RANDOM_SOURCE`: no secure random source is available.
 */
export type Base32KeyErrorCode =
  | 'INVALID_HEX'
  | 'INVALID_CHARACTER'
  | 'INVALID_LENGTH'
  | 'CHECKSUM_MISMATCH'
  | 'INVALID_PREFIX'
  | 'GENERATION_FAILED'
  | 'NO_RANDOM_SOURCE';

/**
 * Error thrown by base32-key for invalid input.
 *
 * `invalidGroups` lists the 0-based indexes of the groups that failed, so a
 * form can highlight exactly which part of a key the user mistyped.
 */
export class Base32KeyError extends Error {
  readonly code: Base32KeyErrorCode;
  readonly invalidGroups: readonly number[];

  constructor(
    code: Base32KeyErrorCode,
    message: string,
    invalidGroups: readonly number[] = []
  ) {
    super(message);
    this.name = 'Base32KeyError';
    this.code = code;
    this.invalidGroups = invalidGroups;
  }
}
