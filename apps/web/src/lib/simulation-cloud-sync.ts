"use client";

import { validate as isUuid } from "uuid";
import {
  SimulationGraphQLError,
  abandonSimulationCloudRun,
  fetchLatestSimulationCloudRun,
  fetchSimulationCloudRun,
  uploadSimulationAutoGradeRun,
  type SimulationCloudUpload,
} from "./simulation-cloud-client";
import {
  materializeSimulationCloudRun,
  type SimulationCloudRun,
} from "./simulation-cloud-parser";
import {
  mergeSimulationCloudState,
  reconcileSimulationCloudState,
} from "./simulation-cloud-reconciliation";
import { useSimulationCloud } from "./simulation-cloud-state";
import { SimulationCloudUploadQueue } from "./simulation-cloud-upload-queue";
import {
  parsePersistedSimulationState,
  type PersistedSimulationState,
} from "./simulation-persistence";
import { isSimulationActive, useSimulation } from "./simulation-store";
import type { ProgressCloudCatalog } from "./progress-cloud-types";
import type { CompletedProgressRun } from "./progress-run";
import { withRunSyncLock } from "./run-sync-lock";
import type { SimulationTaskView } from "./simulation-types";

export { useSimulationCloud } from "./simulation-cloud-state";

type OwnerContext = {
  ownerId: string;
  generation: number;
  catalog: ProgressCloudCatalog;
  catalogKey: string;
  controller: AbortController;
};

let ownerContext: OwnerContext | null = null;
let ownerGeneration = 0;
let bootstrapPromise: Promise<void> = Promise.resolve();
const uploadQueue = new SimulationCloudUploadQueue<OwnerContext>({
  isCurrent: isCurrentContext,
  setStatus: (status) => useSimulationCloud.setState({ status }),
  setReady,
  exposeConflict: exposeWriteConflict,
});

export function bootstrapSimulationCloud(
  userId: string | null,
  catalog: ProgressCloudCatalog,
): Promise<void> {
  const catalogKey = catalogFingerprint(catalog);
  if (
    userId !== null &&
    ownerContext?.ownerId === userId &&
    ownerContext.catalogKey === catalogKey
  ) {
    return bootstrapPromise;
  }

  replaceOwnerContext();
  if (userId === null || !isUuid(userId)) {
    useSimulationCloud.setState({
      ownerId: null,
      enabled: false,
      status: "ready",
      remote: null,
      conflict: null,
      recoveryFailed: false,
    });
    bootstrapPromise = Promise.resolve();
    return bootstrapPromise;
  }

  const context: OwnerContext = {
    ownerId: userId,
    generation: ownerGeneration,
    catalog,
    catalogKey,
    controller: new AbortController(),
  };
  ownerContext = context;
  useSimulationCloud.setState({
    ownerId: userId,
    enabled: true,
    status: "loading",
    remote: null,
    conflict: null,
    recoveryFailed: false,
  });
  bootstrapPromise = loadRemote(context);
  return bootstrapPromise;
}

export function scheduleSimulationCloudUpload(
  upload: SimulationCloudUpload,
  immediate = false,
): void {
  const context = ownerContext;
  const state = parsePersistedSimulationState(upload.state);
  const cloud = useSimulationCloud.getState();
  if (
    context === null ||
    state.phase !== "running" ||
    state.runId === null ||
    state.runOwnerId !== context.ownerId ||
    cloud.status === "loading" ||
    cloud.status === "conflict"
  ) {
    return;
  }
  uploadQueue.schedule(upload, state, context, immediate);
}

export function finishSimulationCloudUpload(runId: string): void {
  uploadQueue.finish(runId);
}

export async function syncSimulationAutoGradeRun(
  run: CompletedProgressRun,
): Promise<boolean> {
  const context = ownerContext;
  if (context === null) return true;
  const state = useSimulation.getState();
  if (
    state.runId !== run.id ||
    state.runOwnerId !== context.ownerId ||
    !isCurrentContext(context)
  ) {
    return false;
  }
  uploadQueue.pause(run.id);
  try {
    await withRunSyncLock(run.id, () =>
      uploadSimulationAutoGradeRun(
        run,
        () => isCurrentContext(context),
        context.controller.signal,
      ),
    );
    if (!isCurrentContext(context)) return false;
    setReady(context);
    return true;
  } catch (error) {
    if (!isAbortError(error) && isCurrentContext(context)) {
      useSimulationCloud.setState({ status: "offline" });
    }
    return false;
  }
}

export function hydrateDiscoveredSimulationRun(
  runId: string,
  blueprintVersion: string,
  contentRevision: string,
  tasks: readonly SimulationTaskView[],
): boolean {
  const context = ownerContext;
  const remote = useSimulationCloud.getState().remote;
  if (
    context === null ||
    remote === null ||
    remote.runtime.runId !== runId ||
    !isCurrentContext(context)
  ) {
    return false;
  }
  const materialized = materializeSimulationCloudRun(
    remote,
    blueprintVersion,
    contentRevision,
    tasks,
  );
  if (materialized === null) {
    useSimulationCloud.setState({ status: "offline" });
    return false;
  }
  const local = useSimulation.getState();
  const next =
    local.phase === null
      ? materialized
      : mergeSimulationCloudState(local, remote);
  if (next === null || !local.restore(next)) {
    exposeConflictState(local, remote);
    return false;
  }
  uploadQueue.unblock(runId);
  setReady(context);
  return true;
}

export async function abandonCurrentSimulationRun(
  runId: string,
): Promise<boolean> {
  const context = ownerContext;
  if (context === null) return true;
  uploadQueue.pause(runId);
  try {
    await abandonForRecovery(runId, context);
    uploadQueue.delete(runId);
    uploadQueue.block(runId);
    setReady(context);
    return true;
  } catch (error) {
    uploadQueue.unblock(runId);
    uploadQueue.resume(runId, context);
    if (!isAbortError(error) && isCurrentContext(context)) {
      useSimulationCloud.setState({ status: "offline" });
    }
    return false;
  }
}

export async function retrySimulationCloud(): Promise<void> {
  const context = ownerContext;
  if (context === null) return;
  await loadRemote(context);
  if (
    !isCurrentContext(context) ||
    useSimulationCloud.getState().status === "conflict"
  ) {
    return;
  }
  uploadQueue.retryAll(context);
}

export async function chooseCloudSimulationVersion(): Promise<boolean> {
  const context = ownerContext;
  const conflict = useSimulationCloud.getState().conflict;
  const local = useSimulation.getState();
  if (
    context === null ||
    conflict?.remote === null ||
    conflict?.remote === undefined ||
    !isSimulationActive(local.phase) ||
    local.runId === null
  ) {
    return false;
  }
  const remote = conflict.remote;
  const localRunId = local.runId;
  uploadQueue.pause(localRunId);
  useSimulationCloud.setState({ recoveryFailed: false });
  try {
    if (localRunId !== remote.runtime.runId) {
      await abandonForRecovery(localRunId, context);
    }
    if (!isCurrentContext(context)) return false;
    useSimulation.getState().reset();
    uploadQueue.delete(localRunId);
    uploadQueue.unblock(localRunId);
    uploadQueue.unblock(remote.runtime.runId);
    setReadyWithRemote(context, remote);
    return true;
  } catch (error) {
    if (!isAbortError(error) && isCurrentContext(context)) {
      useSimulationCloud.setState({ recoveryFailed: true });
    }
    return false;
  }
}

export async function keepLocalSimulationVersion(): Promise<boolean> {
  const context = ownerContext;
  const conflict = useSimulationCloud.getState().conflict;
  const local = useSimulation.getState();
  if (
    context === null ||
    conflict === null ||
    !isSimulationActive(local.phase) ||
    local.runId === null
  ) {
    return false;
  }
  const localRunId = local.runId;
  uploadQueue.pause(localRunId);
  useSimulationCloud.setState({ recoveryFailed: false });
  try {
    if (conflict.remote !== null) {
      await abandonForRecovery(conflict.remote.runtime.runId, context);
    }
    if (!isCurrentContext(context)) return false;
    const collidesWithServer =
      conflict.remote === null || conflict.remote.runtime.runId === localRunId;
    if (
      collidesWithServer &&
      !useSimulation.getState().fork(crypto.randomUUID())
    ) {
      throw new Error("local simulation could not be forked");
    }
    uploadQueue.delete(localRunId);
    uploadQueue.unblock(localRunId);
    uploadQueue.unblock(useSimulation.getState().runId as string);
    setReady(context);
    return true;
  } catch (error) {
    if (!isAbortError(error) && isCurrentContext(context)) {
      useSimulationCloud.setState({ recoveryFailed: true });
    }
    return false;
  }
}

async function loadRemote(context: OwnerContext): Promise<void> {
  try {
    const remote = await fetchLatestSimulationCloudRun(
      context.catalog,
      context.ownerId,
      context.controller.signal,
    );
    if (!isCurrentContext(context)) return;
    reconcileRemote(context, remote);
  } catch (error) {
    if (!isAbortError(error) && isCurrentContext(context)) {
      useSimulationCloud.setState({ status: "offline" });
    }
  }
}

function reconcileRemote(
  context: OwnerContext,
  remote: SimulationCloudRun | null,
): void {
  const local = useSimulation.getState();
  if (remote === null) {
    if (
      useSimulationCloud.getState().status === "conflict" &&
      isSimulationActive(local.phase) &&
      local.runId !== null
    ) {
      uploadQueue.pause(local.runId);
      useSimulationCloud.setState({
        status: "conflict",
        remote: null,
        conflict: {
          localRunId: local.runId,
          remote: null,
          reason: "terminal",
        },
        recoveryFailed: false,
      });
      return;
    }
    setReady(context);
    return;
  }
  const reconciliation = reconcileSimulationCloudState(local, remote);
  if (reconciliation === "discover") {
    if (local.phase === "done") local.reset();
    setReadyWithRemote(context, remote);
    return;
  }
  if (reconciliation === "merge") {
    const merged = mergeSimulationCloudState(local, remote);
    if (merged === null || !local.restore(merged)) {
      useSimulationCloud.setState({ status: "offline" });
      return;
    }
    uploadQueue.unblock(remote.runtime.runId);
    setReady(context);
    return;
  }
  if (reconciliation === "ignore-completed") {
    setReady(context);
    return;
  }
  if (local.runId !== null) uploadQueue.pause(local.runId);
  exposeConflictState(local, remote);
}

async function exposeWriteConflict(
  runId: string,
  context: OwnerContext,
  code: string,
): Promise<boolean> {
  let remote: SimulationCloudRun | null = null;
  if (code === "CONFLICT") {
    try {
      remote = await fetchSimulationCloudRun(
        runId,
        context.catalog,
        context.ownerId,
        context.controller.signal,
      );
    } catch (error) {
      if (isAbortError(error) || !isCurrentContext(context)) return false;
    }
  }
  if (!isCurrentContext(context)) return false;
  const local = useSimulation.getState();
  if (remote !== null) {
    const merged = mergeSimulationCloudState(local, remote);
    if (merged !== null && local.restore(merged)) {
      setReady(context);
      return true;
    }
  }
  exposeConflictState(local, remote);
  return false;
}

function exposeConflictState(
  local: PersistedSimulationState,
  remote: SimulationCloudRun | null,
): void {
  if (!isSimulationActive(local.phase) || local.runId === null) return;
  useSimulationCloud.setState({
    status: "conflict",
    remote,
    conflict: {
      localRunId: local.runId,
      remote,
      reason: remote === null ? "terminal" : "changed",
    },
    recoveryFailed: false,
  });
}

async function abandonForRecovery(
  runId: string,
  context: OwnerContext,
): Promise<void> {
  try {
    await withRunSyncLock(runId, () =>
      abandonSimulationCloudRun(runId, context.controller.signal),
    );
  } catch (error) {
    if (
      error instanceof SimulationGraphQLError &&
      (error.code === "NOT_FOUND" || error.code === "INVALID_STATE")
    ) {
      return;
    }
    throw error;
  }
}

function replaceOwnerContext(): void {
  ownerContext?.controller.abort();
  ownerContext = null;
  ownerGeneration += 1;
  uploadQueue.clear();
}

function setReady(context: OwnerContext): void {
  const local = useSimulation.getState();
  setReadyWithRemote(
    context,
    isSimulationActive(local.phase)
      ? null
      : useSimulationCloud.getState().remote,
  );
}

function setReadyWithRemote(
  context: OwnerContext,
  remote: SimulationCloudRun | null,
): void {
  if (!isCurrentContext(context)) return;
  useSimulationCloud.setState({
    ownerId: context.ownerId,
    enabled: true,
    status: "ready",
    remote,
    conflict: null,
    recoveryFailed: false,
  });
}

function isCurrentContext(context: OwnerContext): boolean {
  return (
    ownerContext === context &&
    ownerContext.generation === context.generation &&
    !context.controller.signal.aborted
  );
}

function catalogFingerprint(catalog: ProgressCloudCatalog): string {
  return JSON.stringify({
    blueprintVersion: catalog.blueprintVersion,
    durationMinutes: catalog.durationMinutes,
    taskCount: catalog.taskCount,
    maxPoints: catalog.maxPoints,
    positions: catalog.positions.map((position) => ({
      ordinal: position.ordinal,
      examPosition: position.examPosition,
      maxPoints: position.maxPoints,
      candidates: position.candidates.map((task) => [
        task.id,
        task.revision,
        task.slot,
        task.topic,
        task.answerPartCount,
      ]),
    })),
  });
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
