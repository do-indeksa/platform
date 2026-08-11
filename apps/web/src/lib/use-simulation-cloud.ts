"use client";

import { useEffect } from "react";
import { useUser } from "@/components/user-provider";
import {
  bootstrapSimulationCloud,
  useSimulationCloud,
} from "./simulation-cloud-sync";
import type { ProgressCloudCatalog } from "./progress-cloud-types";

export function useSimulationCloudBootstrap(
  catalog: ProgressCloudCatalog,
): ReturnType<typeof useSimulationCloud.getState> {
  const { user, loading } = useUser();
  const cloud = useSimulationCloud();

  useEffect(() => {
    if (!loading) {
      void bootstrapSimulationCloud(user?.id ?? null, catalog);
    }
  }, [catalog, loading, user?.id]);

  return cloud;
}
