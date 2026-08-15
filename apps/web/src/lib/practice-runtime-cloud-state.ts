"use client";

import { create } from "zustand";

export type PracticeRuntimeCloudStatus =
  "idle" | "loading" | "ready" | "offline" | "conflict";

type PracticeRuntimeCloudState = {
  ownerId: string | null | undefined;
  enabled: boolean;
  status: PracticeRuntimeCloudStatus;
};

export const usePracticeRuntimeCloud = create<PracticeRuntimeCloudState>(
  () => ({
    ownerId: undefined,
    enabled: false,
    status: "idle",
  }),
);
