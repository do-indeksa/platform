import type { MouseEvent } from "react";
import { describe, expect, it, vi } from "vitest";
import { handlePracticeExit } from "./practice-exit";

describe("practice exit link", () => {
  it("prevents navigation only after a successful finish", () => {
    const successful = clickEvent();
    const finish = vi.fn(() => true);

    handlePracticeExit(successful.event, finish);

    expect(finish).toHaveBeenCalledOnce();
    expect(successful.preventDefault).toHaveBeenCalledOnce();

    const rejected = clickEvent();
    handlePracticeExit(rejected.event, () => false);
    expect(rejected.preventDefault).not.toHaveBeenCalled();
  });

  it("preserves modified link navigation without finishing", () => {
    const modified = clickEvent({ ctrlKey: true });
    const finish = vi.fn(() => true);

    handlePracticeExit(modified.event, finish);

    expect(finish).not.toHaveBeenCalled();
    expect(modified.preventDefault).not.toHaveBeenCalled();
  });
});

function clickEvent(overrides: Partial<MouseEvent<HTMLAnchorElement>> = {}) {
  const preventDefault = vi.fn();
  return {
    preventDefault,
    event: {
      defaultPrevented: false,
      button: 0,
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      preventDefault,
      ...overrides,
    } as MouseEvent<HTMLAnchorElement>,
  };
}
