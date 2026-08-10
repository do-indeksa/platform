"use client";

import type { ReactNode } from "react";
import { usePathname } from "@/i18n/navigation";
import { isImmersivePath } from "@/lib/app-routes";

export function SiteChrome({ children }: { children: ReactNode }) {
  if (isImmersivePath(usePathname())) return null;
  return children;
}
