"use client";

import { SiteHeader } from "@/components/site-header";
import { usePathname } from "@/i18n/navigation";
import { isImmersivePath } from "@/lib/app-routes";

export function SiteChrome() {
  const pathname = usePathname();

  if (pathname === "/" || isImmersivePath(pathname)) return null;
  return <SiteHeader />;
}
