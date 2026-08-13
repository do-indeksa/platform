"use client";

import { useEffect } from "react";
import { useUser } from "@/components/user-provider";
import type { PracticeCloudCatalog } from "./practice-cloud-types";
import {
  bootstrapPracticeRuntimeCloud,
  retryPracticeRuntimeCloud,
  usePracticeRuntimeCloud,
} from "./practice-runtime-cloud-sync";

export function usePracticeRuntimeCloudBootstrap(
  catalog: PracticeCloudCatalog,
): ReturnType<typeof usePracticeRuntimeCloud.getState> {
  const { user, loading } = useUser();
  const cloud = usePracticeRuntimeCloud();

  useEffect(() => {
    if (loading) return;
    void bootstrapPracticeRuntimeCloud(user?.id ?? null, catalog);
    const retry = () => void retryPracticeRuntimeCloud();
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [catalog, loading, user?.id]);

  return cloud;
}
