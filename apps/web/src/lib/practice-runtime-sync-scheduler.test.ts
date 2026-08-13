import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearPracticeRuntimeSyncSchedule,
  schedulePracticeRuntimeSync,
} from "./practice-runtime-sync-scheduler";

const mocks = vi.hoisted(() => ({ sync: vi.fn() }));

vi.mock("./practice-runtime-sync", () => ({
  syncPracticeRuntimeRun: mocks.sync,
}));

const runId = "5ff78318-3436-4b4e-99b8-77ef34366ad3";
const ownerId = "39ec4650-762d-437f-9917-c31ab167cb99";

describe("practice runtime sync scheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.sync.mockResolvedValue({ status: "synced" });
  });

  afterEach(() => {
    clearPracticeRuntimeSyncSchedule();
    mocks.sync.mockReset();
    vi.useRealTimers();
  });

  it("coalesces draft changes into one delayed drain", async () => {
    schedulePracticeRuntimeSync(runId, ownerId);
    schedulePracticeRuntimeSync(runId, ownerId);
    await vi.advanceTimersByTimeAsync(699);
    expect(mocks.sync).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(mocks.sync).toHaveBeenCalledOnce();
    expect(mocks.sync).toHaveBeenCalledWith(runId, ownerId);
  });

  it("drains an attempt immediately", async () => {
    schedulePracticeRuntimeSync(runId, ownerId);
    schedulePracticeRuntimeSync(runId, ownerId, true);
    await vi.waitFor(() => expect(mocks.sync).toHaveBeenCalledOnce());

    await vi.advanceTimersByTimeAsync(1_000);
    expect(mocks.sync).toHaveBeenCalledOnce();
  });

  it("runs once more when state changes during a drain", async () => {
    let release: (() => void) | undefined;
    mocks.sync
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            release = () => resolve({ status: "synced" });
          }),
      )
      .mockResolvedValue({ status: "synced" });
    schedulePracticeRuntimeSync(runId, ownerId, true);
    await vi.waitFor(() => expect(mocks.sync).toHaveBeenCalledOnce());

    schedulePracticeRuntimeSync(runId, ownerId);
    schedulePracticeRuntimeSync(runId, ownerId);
    release?.();
    await vi.advanceTimersByTimeAsync(700);
    expect(mocks.sync).toHaveBeenCalledTimes(2);
  });

  it("does not schedule invalid owners", async () => {
    schedulePracticeRuntimeSync(runId, "invalid", true);
    await vi.runAllTimersAsync();
    expect(mocks.sync).not.toHaveBeenCalled();
  });
});
