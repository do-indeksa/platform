"use client";

import { MarketingHeader } from "@/components/marketing-header";
import { SiteHeader } from "@/components/site-header";
import { useUser } from "@/components/user-provider";

export function LandingHeader({ hasSessionHint }: { hasSessionHint: boolean }) {
  const { user, loading } = useUser();
  const showAppHeader = loading ? hasSessionHint : user !== null;

  return showAppHeader ? (
    <SiteHeader placement="landing" />
  ) : (
    <MarketingHeader />
  );
}
