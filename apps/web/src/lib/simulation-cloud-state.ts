"use client";

import { create } from "zustand";
import type { SimulationCloudRun } from "./simulation-cloud-parser";

export type SimulationCloudStatus =
  "idle" | "loading" | "ready" | "syncing" | "offline" | "conflict";

export type SimulationCloudConflict = {
  localRunId: string;
  remote: SimulationCloudRun | null;
  reason: "changed" | "terminal";
};

type SimulationCloudState = {
  ownerId: string | null | undefined;
  enabled: boolean;
  status: SimulationCloudStatus;
  remote: SimulationCloudRun | null;
  conflict: SimulationCloudConflict | null;
  recoveryFailed: boolean;
};

export const useSimulationCloud = create<SimulationCloudState>(() => ({
  ownerId: undefined,
  enabled: false,
  status: "idle",
  remote: null,
  conflict: null,
  recoveryFailed: false,
}));
