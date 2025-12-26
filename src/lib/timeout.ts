/**
 * Wraps a promise with a timeout, ensuring the timeout is cleared
 * when the promise settles to prevent memory leaks.
 *
 * @param promise - The promise to wrap with a timeout
 * @param timeoutMs - Timeout duration in milliseconds
 * @param errorMessage - Optional custom error message for timeout
 * @returns The result of the promise if it completes before timeout
 * @throws Error if the timeout is reached before the promise settles
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage = "Operation timeout",
): Promise<T> {
  let timeoutId: Timer | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutId);
  });
}
