"use client";

import { usePathname } from "next/navigation";
import { useUser } from "@/components/user-provider";
import type { PrepAction } from "@/lib/prep-plan";
import { NextActionCard, TodayPlan } from "./prep-action-list";
import { GuestOffer } from "./prep-readiness-card";

export function PrepWeekView({
  actions,
  nextAction,
  nextActionHref,
  hrefFor,
  onOpenSettings,
}: {
  actions: PrepAction[];
  nextAction: PrepAction | null;
  nextActionHref: string;
  hrefFor: (action: PrepAction) => string;
  onOpenSettings: () => void;
}) {
  const pathname = usePathname();
  const { user, loading } = useUser();

  return (
    <section data-design-status="provisional" className="py-2 lg:py-3">
      <NextActionCard
        action={nextAction}
        href={nextActionHref}
        onOpenSettings={onOpenSettings}
      />
      <TodayPlan
        actions={actions}
        nextActionId={nextAction?.id ?? null}
        hrefFor={hrefFor}
        onOpenSettings={onOpenSettings}
      />
      {!loading && user === null && (
        <div className="mt-8">
          <GuestOffer pathname={pathname} />
        </div>
      )}
    </section>
  );
}
