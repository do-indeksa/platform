import Image from "next/image";
import type { ReactNode } from "react";

const featureIcons = {
  guest: "/marketing/feature-guest.svg",
  tasks: "/marketing/feature-tasks.svg",
  plan: "/marketing/feature-plan.svg",
  mock: "/marketing/feature-mock.svg",
} as const;

export function LandingFeatureCard({
  type,
  title,
  children,
}: {
  type: keyof typeof featureIcons;
  title: string;
  children: ReactNode;
}) {
  return (
    <article className="flex h-[216px] w-full flex-col items-start gap-4 rounded-2xl border border-line bg-surface p-6 xl:w-[296px]">
      <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-subtle">
        <Image
          src={featureIcons[type]}
          alt=""
          width={24}
          height={24}
          className="size-6"
        />
      </span>
      <div className="flex h-[68px] w-[248px] max-w-full flex-col items-start gap-2 overflow-hidden">
        <h2 className="w-full text-base leading-6 font-semibold text-ink">
          {title}
        </h2>
        <p className="w-full text-sm leading-5 font-normal text-muted">
          {children}
        </p>
      </div>
    </article>
  );
}
