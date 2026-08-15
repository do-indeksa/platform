"use client";

import { MarketingHeader } from "@/components/marketing-header";
import { SiteHeader } from "@/components/site-header";
import { useUser } from "@/components/user-provider";
import { usePathname } from "@/i18n/navigation";
import { isImmersivePath } from "@/lib/app-routes";

export function SiteChrome() {
  const pathname = usePathname();
  const { user } = useUser();

  if (isImmersivePath(pathname)) return null;
  if (pathname === "/") {
    if (user === null) return <MarketingHeader />;
    return <SiteHeader placement="landing" />;
  }
  return <SiteHeader />;
}
