import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";

export function CabinetLinkButton({
  href,
  children,
  variant = "secondary",
  className = "",
  compactOnMobile = false,
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary";
  className?: string;
  compactOnMobile?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center justify-center rounded-xl border px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
        compactOnMobile ? "h-11 md:h-12" : "h-12"
      } ${
        variant === "primary"
          ? "border-brand bg-brand text-on-brand hover:bg-brand-hover"
          : "border-line bg-surface text-ink hover:bg-subtle"
      } ${className}`}
    >
      {children}
    </Link>
  );
}
