import { useCallback, useSyncExternalStore } from "react";

const subscribeEverySecond = (notify: () => void) => {
  const interval = setInterval(notify, 1000);
  return () => clearInterval(interval);
};

export function useRemainingSeconds(endsAt: number | null): number {
  const getSnapshot = useCallback(
    () =>
      endsAt === null
        ? 0
        : Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)),
    [endsAt],
  );
  return useSyncExternalStore(subscribeEverySecond, getSnapshot, () => 0);
}
