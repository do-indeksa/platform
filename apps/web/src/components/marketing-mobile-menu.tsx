"use client";

import { Menu, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { HeaderUser } from "@/components/header-user";
import { Link } from "@/i18n/navigation";

export type MarketingLink = {
  href: string;
  label: string;
};

export function MarketingMobileMenu({
  items,
  menuLabel,
}: {
  items: MarketingLink[];
  menuLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const firstLinkRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (!open) return;
    firstLinkRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  return (
    <div className="relative md:hidden">
      <button
        ref={buttonRef}
        type="button"
        data-testid="marketing-menu-button"
        aria-label={menuLabel}
        aria-expanded={open}
        aria-controls="mobile-marketing-menu"
        onClick={() => setOpen((current) => !current)}
        className="flex size-9 items-center justify-center overflow-hidden rounded-[18px] bg-subtle text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        {open ? (
          <X aria-hidden size={16} strokeWidth={1.8} />
        ) : (
          <Menu aria-hidden size={16} strokeWidth={1.8} />
        )}
      </button>
      {open && (
        <div
          id="mobile-marketing-menu"
          className="absolute top-12 right-0 z-50 w-[min(326px,calc(100vw-32px))] rounded-xl border border-line bg-surface p-3 shadow-lg"
        >
          <nav aria-label={menuLabel} className="grid gap-1">
            {items.map((item, index) => (
              <Link
                key={item.href}
                ref={index === 0 ? firstLinkRef : undefined}
                href={item.href}
                onClick={() => setOpen(false)}
                className="flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-ink hover:bg-page focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-brand"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="mt-3 border-t border-line pt-3">
            <HeaderUser placement="menu" />
          </div>
        </div>
      )}
    </div>
  );
}
