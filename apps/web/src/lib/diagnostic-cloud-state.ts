"use client";

import { create } from "zustand";
import type { DiagnosticCloudRun } from "./diagnostic-cloud-parser";

export type DiagnosticCloudStatus =
  "idle" | "loading" | "ready" | "syncing" | "offline" | "conflict";

export type DiagnosticCloudConflict = {
  localRunId: string;
  remote: DiagnosticCloudRun | null;
  reason: "changed" | "terminal";
};

type DiagnosticCloudState = {
  ownerId: string | null | undefined;
  enabled: boolean;
  status: DiagnosticCloudStatus;
  conflict: DiagnosticCloudConflict | null;
  recoveryFailed: boolean;
};

export const useDiagnosticCloud = create<DiagnosticCloudState>(() => ({
  ownerId: undefined,
  enabled: false,
  status: "idle",
  conflict: null,
  recoveryFailed: false,
}));
