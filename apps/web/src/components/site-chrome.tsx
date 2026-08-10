"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function SiteChrome({ children }: { children: ReactNode }) {
  const segments = usePathname().split("/").filter(Boolean);
  if (segments.length === 3 && segments[0] === "tasks") return null;
  return children;
}
