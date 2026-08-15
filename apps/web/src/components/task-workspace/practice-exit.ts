import type { MouseEvent } from "react";

export function handlePracticeExit(
  event: MouseEvent<HTMLAnchorElement>,
  onFinish: (() => boolean) | undefined,
): void {
  if (
    onFinish === undefined ||
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return;
  }
  event.preventDefault();
  onFinish();
}
