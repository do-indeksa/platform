import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";

export function LandingButton({
  href,
  children,
  variant = "primary",
  mobileFullWidth = false,
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary";
  mobileFullWidth?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex min-h-[52px] items-center justify-center rounded-xl p-4 text-[15px] leading-5 font-semibold whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
        mobileFullWidth ? "w-full md:w-auto" : ""
      } ${
        variant === "primary"
          ? "bg-gradient-to-r from-[#6b36f3] to-[#4b22d5] text-on-brand hover:from-[#6535f2] hover:to-[#431dc2]"
          : "border border-line bg-surface text-ink hover:bg-page"
      }`}
    >
      {children}
    </Link>
  );
}
