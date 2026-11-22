import vectors from '../../test-vectors.json';

/** A valid vector in the short form used by the specs. */
export interface TestVector {
  readonly hex: string;
  /** upper/lower case, grouped, checked */
  readonly ucg: string;
  readonly lcg: string;
  /** ungrouped, checked */
  readonly uc: string;
  readonly lc: string;
  /** grouped, unchecked */
  readonly ucgu: string;
  readonly lcgu: string;
  /** ungrouped, unchecked */
  readonly ucu: string;
  readonly lcu: string;
}

export const testVectors: readonly TestVector[] = vectors.valid.map((v) => ({
  hex: v.hex,
  ucg: v.upper.grouped,
  lcg: v.lower.grouped,
  uc: v.upper.ungrouped,
  lc: v.lower.ungrouped,
  ucgu: v.upper.groupedUnchecked,
  lcgu: v.lower.groupedUnchecked,
  ucu: v.upper.ungroupedUnchecked,
  lcu: v.lower.ungroupedUnchecked,
}));

export const invalidVectors = vectors.invalid;
export const bytesVectors = vectors.bytes;
