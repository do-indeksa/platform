import { describe, expect, it } from "vitest";
import {
  learningRunOwnerTransition,
  parseLearningRunOwner,
} from "./learning-run-owner";

const USER_A = "a0209703-275b-4c6e-b815-25025b923ae8";
const USER_B = "71c4bd20-7512-446a-bc6a-d95a7cb7d665";

describe("learning run ownership", () => {
  it("distinguishes a guest from an invalid account id", () => {
    expect(parseLearningRunOwner(null)).toBeNull();
    expect(parseLearningRunOwner(USER_A)).toBe(USER_A);
    expect(parseLearningRunOwner("not-a-user-id")).toBeUndefined();
  });

  it("claims guest work and clears foreign account work", () => {
    expect(learningRunOwnerTransition(null, USER_A)).toBe("claim");
    expect(learningRunOwnerTransition(USER_A, USER_A)).toBe("keep");
    expect(learningRunOwnerTransition(USER_A, USER_B)).toBe("clear");
    expect(learningRunOwnerTransition(USER_A, null)).toBe("clear");
  });
});
