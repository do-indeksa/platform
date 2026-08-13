import { describe, expect, it } from "vitest";
import type { ProgressCloudCatalog } from "./progress-cloud-types";
import { getPracticeCloudCatalog } from "./practice-cloud-catalog";

const revision = (character: string) => `sha256:${character.repeat(64)}`;

describe("practice cloud catalog", () => {
  it("deduplicates exact task identities in stable position order", () => {
    const first = task("kb-001", revision("a"), 1);
    const second = task("kv-001", revision("b"), 2);
    const catalog = progressCatalog([
      { number: 1, candidates: [first] },
      { number: 2, candidates: [second, first] },
    ]);

    expect(getPracticeCloudCatalog(catalog)).toEqual({
      blueprintVersion: "ftn-p1:2026.1",
      tasks: [first, second],
    });
  });

  it("rejects one task ID with conflicting immutable metadata", () => {
    const first = task("kb-001", revision("a"), 1);
    const conflicting = { ...first, revision: revision("b") };

    expect(() =>
      getPracticeCloudCatalog(
        progressCatalog([
          { number: 1, candidates: [first] },
          { number: 2, candidates: [conflicting] },
        ]),
      ),
    ).toThrow("practice catalog has conflicting task kb-001");
  });
});

function progressCatalog(
  positions: {
    number: number;
    candidates: ReturnType<typeof task>[];
  }[],
): ProgressCloudCatalog {
  return {
    blueprintVersion: "ftn-p1:2026.1",
    durationMinutes: 240,
    taskCount: 10,
    maxPoints: 60,
    positions: positions.map(({ number, candidates }) => ({
      ordinal: number,
      examPosition: number,
      maxPoints: 6,
      candidates,
    })),
  };
}

function task(id: string, taskRevision: string, slot: number) {
  return {
    id,
    revision: taskRevision,
    slot,
    topic: slot === 1 ? "kompleksni-brojevi" : "kvadratne-jednacine",
    answerPartCount: 1,
  };
}
