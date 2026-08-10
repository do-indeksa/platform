import { describe, expect, it } from "vitest";
import { isImmersivePath, isNavigationItemActive } from "./app-routes";

describe("app routes", () => {
  it("marks a section and its descendants as active", () => {
    expect(isNavigationItemActive("/tasks", "/tasks")).toBe(true);
    expect(isNavigationItemActive("/tasks/algebra", "/tasks")).toBe(true);
    expect(isNavigationItemActive("/prep", "/tasks")).toBe(false);
    expect(isNavigationItemActive("/taskset", "/tasks")).toBe(false);
  });

  it("uses an immersive shell for focused task and timed-run routes", () => {
    expect(isImmersivePath("/tasks/algebra/task-1")).toBe(true);
    expect(isImmersivePath("/simulation/new")).toBe(true);
    expect(isImmersivePath("/diagnostic/new")).toBe(true);
    expect(isImmersivePath("/tasks/algebra")).toBe(false);
    expect(isImmersivePath("/simulation")).toBe(false);
  });
});
