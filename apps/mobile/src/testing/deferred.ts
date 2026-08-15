/**
 * A promise plus its settle functions, for tests that need to hold an async
 * call open and decide later how it ends.
 *
 * Three test files had each grown their own copy, and they had already drifted:
 * one had no `reject` at all, so the file that needed a mid-flight failure
 * could not express one without adding it back. Cases like "a second write
 * lands while the first is still in flight" are only reachable when the test
 * controls the ordering, so this is the seam that makes concurrency regressions
 * testable at all -- worth having exactly one of.
 */
export function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (cause?: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (cause?: unknown) => void;
  const promise = new Promise<T>((settle, fail) => {
    resolve = settle;
    reject = fail;
  });
  return { promise, resolve, reject };
}
