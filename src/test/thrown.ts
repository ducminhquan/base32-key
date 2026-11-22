/**
 * Runs `fn` and returns what it threw, so a test can inspect the error.
 * Fails the test if `fn` does not throw.
 */
export function thrown<T = Error>(fn: () => unknown): T {
  try {
    fn();
  } catch (error) {
    return error as T;
  }
  throw new Error('Expected the function to throw');
}
