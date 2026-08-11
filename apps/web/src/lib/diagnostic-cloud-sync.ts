"use client";

import { validate as isUuid } from "uuid";
import {
  DiagnosticGraphQLError,
  abandonDiagnosticCloudRun,
  fetchDiagnosticCloudRun,
  fetchLatestDiagnosticCloudRun,
  type DiagnosticCloudUpload,
} from "./diagnostic-cloud-client";
import type { DiagnosticCloudRun } from "./diagnostic-cloud-parser";
import { reconcileDiagnosticCloudState } from "./diagnostic-cloud-reconciliation";
import { useDiagnosticCloud } from "./diagnostic-cloud-state";
import {
  parsePersistedDiagnosticState,
  useDiagnostic,
} from "./diagnostic-store";
import type { DiagnosticCloudCatalog } from "./diagnostic-cloud-types";
import { DiagnosticCloudUploadQueue } from "./diagnostic-cloud-upload-queue";
import { withRunSyncLock } from "./run-sync-lock";

export { useDiagnosticCloud } from "./diagnostic-cloud-state";

type OwnerContext = {
  ownerId: string;
  generation: number;
  catalog: DiagnosticCloudCatalog;
  catalogKey: string;
  controller: AbortController;
};

let ownerContext: OwnerContext | null = null;
let ownerGeneration = 0;
let bootstrapPromise: Promise<void> = Promise.resolve();
const uploadQueue = new DiagnosticCloudUploadQueue<OwnerContext>({
  isCurrent: isCurrentContext,
  setStatus: (status) => useDiagnosticCloud.setState({ status }),
  setReady,
  exposeConflict: exposeWriteConflict,
});

export function bootstrapDiagnosticCloud(
  userId: string | null,
  catalog: DiagnosticCloudCatalog,
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
    useDiagnosticCloud.setState({
      ownerId: null,
      enabled: false,
      status: "ready",
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
  useDiagnosticCloud.setState({
    ownerId: userId,
    enabled: true,
    status: "loading",
    conflict: null,
    recoveryFailed: false,
  });
  bootstrapPromise = loadRemote(context);
  return bootstrapPromise;
}

export function scheduleDiagnosticCloudUpload(
  upload: DiagnosticCloudUpload,
  immediate = false,
): void {
  const context = ownerContext;
  const state = parsePersistedDiagnosticState(upload.state);
  const cloud = useDiagnosticCloud.getState();
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

export function finishDiagnosticCloudUpload(runId: string): void {
  uploadQueue.finish(runId);
}

export async function abandonCurrentDiagnosticRun(
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
      useDiagnosticCloud.setState({ status: "offline" });
    }
    return false;
  }
}

export async function retryDiagnosticCloud(): Promise<void> {
  const context = ownerContext;
  if (context === null) return;
  await loadRemote(context);
  if (
    !isCurrentContext(context) ||
    useDiagnosticCloud.getState().status === "conflict"
  ) {
    return;
  }
  uploadQueue.retryAll(context);
}

export async function restoreCloudDiagnosticVersion(): Promise<boolean> {
  const context = ownerContext;
  const conflict = useDiagnosticCloud.getState().conflict;
  const local = useDiagnostic.getState();
  if (
    context === null ||
    conflict?.remote === null ||
    conflict?.remote === undefined ||
    local.phase !== "running" ||
    local.runId === null
  ) {
    return false;
  }
  uploadQueue.pause(local.runId);
  useDiagnosticCloud.setState({ recoveryFailed: false });
  try {
    if (local.runId !== conflict.remote.runtime.runId) {
      await abandonForRecovery(local.runId, context);
    }
    if (!isCurrentContext(context)) return false;
    const restored = useDiagnostic.getState().restore(conflict.remote.runtime);
    if (!restored) throw new Error("cloud diagnostic could not be restored");
    uploadQueue.delete(local.runId);
    uploadQueue.unblock(local.runId);
    uploadQueue.unblock(conflict.remote.runtime.runId as string);
    setReady(context);
    return true;
  } catch (error) {
    if (!isAbortError(error) && isCurrentContext(context)) {
      useDiagnosticCloud.setState({ recoveryFailed: true });
    }
    return false;
  }
}

export async function keepLocalDiagnosticVersion(): Promise<boolean> {
  const context = ownerContext;
  const conflict = useDiagnosticCloud.getState().conflict;
  const local = useDiagnostic.getState();
  if (
    context === null ||
    conflict === null ||
    local.phase !== "running" ||
    local.runId === null
  ) {
    return false;
  }
  const localRunId = local.runId;
  uploadQueue.pause(localRunId);
  useDiagnosticCloud.setState({ recoveryFailed: false });
  try {
    if (conflict.remote !== null) {
      await abandonForRecovery(
        conflict.remote.runtime.runId as string,
        context,
      );
    }
    if (!isCurrentContext(context)) return false;
    const collidesWithServer =
      conflict.remote === null || conflict.remote.runtime.runId === localRunId;
    if (
      collidesWithServer &&
      !useDiagnostic.getState().fork(crypto.randomUUID())
    ) {
      throw new Error("local diagnostic could not be forked");
    }
    uploadQueue.delete(localRunId);
    uploadQueue.unblock(useDiagnostic.getState().runId as string);
    setReady(context);
    return true;
  } catch (error) {
    if (!isAbortError(error) && isCurrentContext(context)) {
      useDiagnosticCloud.setState({ recoveryFailed: true });
    }
    return false;
  }
}

async function loadRemote(context: OwnerContext): Promise<void> {
  try {
    const remote = await fetchLatestDiagnosticCloudRun(
      context.catalog,
      context.ownerId,
      context.controller.signal,
    );
    if (!isCurrentContext(context)) return;
    reconcileRemote(context, remote);
  } catch (error) {
    if (!isAbortError(error) && isCurrentContext(context)) {
      useDiagnosticCloud.setState({ status: "offline" });
    }
  }
}

function reconcileRemote(
  context: OwnerContext,
  remote: DiagnosticCloudRun | null,
): void {
  if (remote === null) {
    setReady(context);
    return;
  }
  const local = useDiagnostic.getState();
  const reconciliation = reconcileDiagnosticCloudState(local, remote);
  if (reconciliation === "hydrate") {
    if (!local.restore(remote.runtime)) {
      useDiagnosticCloud.setState({ status: "offline" });
      return;
    }
    setReady(context);
    return;
  }
  if (reconciliation === "continue") {
    local.adoptCheckpointVersion(
      remote.runtime.runId as string,
      remote.runtime.checkpointVersion,
    );
    setReady(context);
    return;
  }
  if (reconciliation === "ignore-completed") {
    setReady(context);
    return;
  }
  uploadQueue.pause(local.runId as string);
  useDiagnosticCloud.setState({
    status: "conflict",
    conflict: {
      localRunId: local.runId as string,
      remote,
      reason: "changed",
    },
    recoveryFailed: false,
  });
}

async function exposeWriteConflict(
  runId: string,
  context: OwnerContext,
  code: string,
): Promise<boolean> {
  let remote: DiagnosticCloudRun | null = null;
  if (code === "CONFLICT") {
    try {
      remote = await fetchDiagnosticCloudRun(
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
  if (
    remote !== null &&
    reconcileDiagnosticCloudState(useDiagnostic.getState(), remote) ===
      "continue"
  ) {
    useDiagnostic
      .getState()
      .adoptCheckpointVersion(runId, remote.runtime.checkpointVersion);
    setReady(context);
    return true;
  }
  useDiagnosticCloud.setState({
    status: "conflict",
    conflict: {
      localRunId: runId,
      remote,
      reason: remote === null ? "terminal" : "changed",
    },
    recoveryFailed: false,
  });
  return false;
}

async function abandonForRecovery(
  runId: string,
  context: OwnerContext,
): Promise<void> {
  try {
    await withRunSyncLock(runId, () =>
      abandonDiagnosticCloudRun(runId, context.controller.signal),
    );
  } catch (error) {
    if (
      error instanceof DiagnosticGraphQLError &&
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
  if (!isCurrentContext(context)) return;
  useDiagnosticCloud.setState({
    ownerId: context.ownerId,
    enabled: true,
    status: "ready",
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

function catalogFingerprint(catalog: DiagnosticCloudCatalog): string {
  return JSON.stringify({
    blueprintVersion: catalog.blueprintVersion,
    positions: catalog.positions.map((position) => ({
      ordinal: position.ordinal,
      examPosition: position.examPosition,
      candidates: position.candidates.map((task) => [task.id, task.revision]),
    })),
  });
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
