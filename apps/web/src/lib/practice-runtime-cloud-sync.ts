"use client";

import { validate as isUuid } from "uuid";
import { fetchLatestPracticeCloudRun } from "./practice-cloud-client";
import type { PracticeCloudCatalog } from "./practice-cloud-types";
import { usePracticeRuntimeCloud } from "./practice-runtime-cloud-state";
import { usePracticeRuntime } from "./practice-runtime-store";
import { syncPracticeRuntimeRuns } from "./practice-runtime-sync";

type OwnerContext = {
  ownerId: string;
  generation: number;
  runtimeGeneration: number;
  catalog: PracticeCloudCatalog;
  catalogKey: string;
  controller: AbortController;
};

const MAX_STABLE_LOAD_ATTEMPTS = 2;

let ownerContext: OwnerContext | null = null;
let ownerGeneration = 0;
let bootstrapPromise: Promise<void> = Promise.resolve();
let activeLoad: { context: OwnerContext; promise: Promise<void> } | null = null;

export { usePracticeRuntimeCloud } from "./practice-runtime-cloud-state";

export function bootstrapPracticeRuntimeCloud(
  userId: string | null,
  catalog: PracticeCloudCatalog,
): Promise<void> {
  const runtime = usePracticeRuntime.getState();
  const catalogKey = catalogFingerprint(catalog);
  if (
    userId !== null &&
    ownerContext?.ownerId === userId &&
    ownerContext.runtimeGeneration === runtime.authOwnerGeneration &&
    ownerContext.catalogKey === catalogKey
  ) {
    return activeLoad?.context === ownerContext
      ? activeLoad.promise
      : bootstrapPromise;
  }

  replaceOwnerContext();
  if (userId === null || !isUuid(userId) || runtime.authOwnerId !== userId) {
    usePracticeRuntimeCloud.setState({
      ownerId: null,
      enabled: false,
      status: "ready",
    });
    bootstrapPromise = Promise.resolve();
    return bootstrapPromise;
  }

  const context: OwnerContext = {
    ownerId: userId,
    generation: ownerGeneration,
    runtimeGeneration: runtime.authOwnerGeneration,
    catalog,
    catalogKey,
    controller: new AbortController(),
  };
  ownerContext = context;
  usePracticeRuntimeCloud.setState({
    ownerId: userId,
    enabled: true,
    status: "loading",
  });
  bootstrapPromise = startLoad(context);
  return bootstrapPromise;
}

export function retryPracticeRuntimeCloud(): Promise<void> {
  const context = ownerContext;
  if (context === null || !isCurrentContext(context)) return Promise.resolve();
  bootstrapPromise = startLoad(context);
  return bootstrapPromise;
}

function startLoad(context: OwnerContext): Promise<void> {
  if (activeLoad?.context === context) return activeLoad.promise;
  const promise = loadRemote(context).finally(() => {
    if (activeLoad?.promise === promise) activeLoad = null;
  });
  activeLoad = { context, promise };
  return promise;
}

async function loadRemote(context: OwnerContext): Promise<void> {
  try {
    for (let attempt = 0; attempt < MAX_STABLE_LOAD_ATTEMPTS; attempt += 1) {
      const summary = await syncPracticeRuntimeRuns(context.ownerId, {
        signal: context.controller.signal,
      });
      if (!isCurrentContext(context)) return;
      if (summary.status === "conflict" || summary.status === "offline") {
        setStatus(context, summary.status);
        return;
      }

      const runs = usePracticeRuntime.getState().runs;
      const remote = await fetchLatestPracticeCloudRun(
        context.catalog,
        context.ownerId,
        context.controller.signal,
      );
      if (!isCurrentContext(context)) return;
      if (usePracticeRuntime.getState().runs !== runs) continue;
      if (remote !== null && !usePracticeRuntime.getState().restore(remote)) {
        setStatus(context, "conflict");
        return;
      }
      setStatus(context, "ready");
      return;
    }

    setStatus(context, "ready");
  } catch (error) {
    if (!isAbortError(error) && isCurrentContext(context)) {
      setStatus(context, "offline");
    }
  }
}

function replaceOwnerContext(): void {
  ownerContext?.controller.abort();
  ownerContext = null;
  ownerGeneration += 1;
}

function setStatus(
  context: OwnerContext,
  status: "ready" | "offline" | "conflict",
): void {
  if (!isCurrentContext(context)) return;
  usePracticeRuntimeCloud.setState({
    ownerId: context.ownerId,
    enabled: true,
    status,
  });
}

function isCurrentContext(context: OwnerContext): boolean {
  const runtime = usePracticeRuntime.getState();
  return (
    ownerContext === context &&
    context.generation === ownerGeneration &&
    runtime.authOwnerId === context.ownerId &&
    runtime.authOwnerGeneration === context.runtimeGeneration &&
    !context.controller.signal.aborted
  );
}

function catalogFingerprint(catalog: PracticeCloudCatalog): string {
  return JSON.stringify({
    blueprintVersion: catalog.blueprintVersion,
    tasks: catalog.tasks.map((task) => [
      task.id,
      task.revision,
      task.slot,
      task.topic,
      task.answerPartCount,
    ]),
  });
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
