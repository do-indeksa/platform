import type { MouseEvent } from "react";
import { describe, expect, it, vi } from "vitest";
import { handlePracticeExit } from "./practice-exit";

describe("practice exit link", () => {
  it.each([true, false])(
    "owns ordinary navigation when finish returns %s",
    (result) => {
      const click = clickEvent();
      const finish = vi.fn(() => result);

      handlePracticeExit(click.event, finish);

      expect(finish).toHaveBeenCalledOnce();
      expect(click.preventDefault).toHaveBeenCalledOnce();
    },
  );

  it.each([
    ["default prevented", { defaultPrevented: true }],
    ["middle click", { button: 1 }],
    ["meta key", { metaKey: true }],
    ["control key", { ctrlKey: true }],
    ["shift key", { shiftKey: true }],
    ["alt key", { altKey: true }],
  ])("preserves %s navigation without finishing", (_name, overrides) => {
    const click = clickEvent(overrides);
    const finish = vi.fn(() => true);

    handlePracticeExit(click.event, finish);

    expect(finish).not.toHaveBeenCalled();
    expect(click.preventDefault).not.toHaveBeenCalled();
  });

  it("preserves navigation without a runtime finish contract", () => {
    const click = clickEvent();

    handlePracticeExit(click.event, undefined);

    expect(click.preventDefault).not.toHaveBeenCalled();
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
