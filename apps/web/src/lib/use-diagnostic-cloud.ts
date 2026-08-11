"use client";

import { useEffect } from "react";
import { useUser } from "@/components/user-provider";
import {
  bootstrapDiagnosticCloud,
  useDiagnosticCloud,
} from "./diagnostic-cloud-sync";
import type { DiagnosticCloudCatalog } from "./diagnostic-cloud-types";

export function useDiagnosticCloudBootstrap(
  catalog: DiagnosticCloudCatalog,
): ReturnType<typeof useDiagnosticCloud.getState> {
  const { user, loading } = useUser();
  const cloud = useDiagnosticCloud();

  useEffect(() => {
    if (!loading) {
      void bootstrapDiagnosticCloud(user?.id ?? null, catalog);
    }
  }, [catalog, loading, user?.id]);

  return cloud;
}
