import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";

export function CabinetLinkButton({
  href,
  children,
  variant = "secondary",
  className = "",
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary";
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex h-12 items-center justify-center rounded-xl border px-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
        variant === "primary"
          ? "border-brand bg-brand text-on-brand hover:bg-brand-hover"
          : "border-line bg-surface text-ink hover:bg-subtle"
      } ${className}`}
    >
      {children}
    </Link>
  );
}
