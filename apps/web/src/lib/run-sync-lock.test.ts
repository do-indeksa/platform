import { describe, expect, it } from "vitest";
import { withRunSyncLock } from "./run-sync-lock";

describe("run sync lock", () => {
  it("serializes one run while allowing another run to proceed", async () => {
    const events: string[] = [];
    let releaseFirst = () => {};
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = withRunSyncLock("run-a", async () => {
      events.push("first:start");
      await firstGate;
      events.push("first:end");
    });
    const second = withRunSyncLock("run-a", async () => {
      events.push("second");
    });
    const other = withRunSyncLock("run-b", async () => {
      events.push("other");
    });

    await other;
    expect(events).toEqual(["first:start", "other"]);
    releaseFirst();
    await Promise.all([first, second]);
    expect(events).toEqual(["first:start", "other", "first:end", "second"]);
  });

  it("does not poison a run after an operation fails", async () => {
    await expect(
      withRunSyncLock("run-c", async () => {
        throw new Error("failed");
      }),
    ).rejects.toThrow("failed");

    await expect(
      withRunSyncLock("run-c", async () => "recovered"),
    ).resolves.toBe("recovered");
  });
});
