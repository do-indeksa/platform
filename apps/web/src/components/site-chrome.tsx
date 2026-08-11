"use client";

import type { ReactNode } from "react";
import { MarketingHeader } from "@/components/marketing-header";
import { useUser } from "@/components/user-provider";
import { usePathname } from "@/i18n/navigation";
import { isImmersivePath } from "@/lib/app-routes";

export function SiteChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user } = useUser();

  if (isImmersivePath(pathname)) return null;
  if (pathname === "/") {
    if (user === null) return <MarketingHeader />;
    return (
      <div className="mx-auto w-full max-w-[1440px] px-4 md:px-14 xl:px-20">
        {children}
      </div>
    );
  }
  return children;
}
