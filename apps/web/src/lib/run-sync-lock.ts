const tails = new Map<string, Promise<void>>();

export async function withRunSyncLock<T>(
  runId: string,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = tails.get(runId) ?? Promise.resolve();
  const result = previous.catch(() => {}).then(operation);
  const tail = result.then(
    () => {},
    () => {},
  );
  tails.set(runId, tail);
  try {
    return await result;
  } finally {
    if (tails.get(runId) === tail) tails.delete(runId);
  }
}
