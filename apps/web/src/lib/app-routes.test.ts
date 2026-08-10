import { describe, expect, it } from "vitest";
import {
  examCodeFromPathname,
  isImmersivePath,
  isNavigationItemActive,
} from "./app-routes";

describe("app routes", () => {
  it("marks a section and its descendants as active", () => {
    expect(isNavigationItemActive("/", "/")).toBe(true);
    expect(isNavigationItemActive("/tasks", "/")).toBe(false);
    expect(isNavigationItemActive("/tasks", "/tasks")).toBe(true);
    expect(isNavigationItemActive("/tasks/algebra", "/tasks")).toBe(true);
    expect(isNavigationItemActive("/prep", "/tasks")).toBe(false);
    expect(isNavigationItemActive("/taskset", "/tasks")).toBe(false);
    expect(isNavigationItemActive("/exams/ftn-p3", "/exams")).toBe(true);
    expect(isNavigationItemActive("/faculties/ftn", "/faculties/ftn")).toBe(
      true,
    );
  });

  it("uses an immersive shell for focused task and timed-run routes", () => {
    expect(isImmersivePath("/tasks/algebra/task-1")).toBe(true);
    expect(isImmersivePath("/simulation/new")).toBe(true);
    expect(isImmersivePath("/diagnostic/new")).toBe(true);
    expect(isImmersivePath("/tasks/algebra")).toBe(false);
    expect(isImmersivePath("/simulation")).toBe(false);
  });

  it("extracts only official FTN exam codes from detail routes", () => {
    expect(examCodeFromPathname("/exams/ftn-p3")).toBe("P3");
    expect(examCodeFromPathname("/exams/ftn-p8/")).toBe("P8");
    expect(examCodeFromPathname("/exams/ftn-p2")).toBeNull();
    expect(examCodeFromPathname("/exams")).toBeNull();
  });
});
