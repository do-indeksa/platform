"use client";

import { Menu, X } from "lucide-react";
import { useRef } from "react";
import { HeaderUser } from "@/components/header-user";

export type MarketingLink = {
  href: `#${string}`;
  label: string;
};

export function MarketingMobileMenu({
  items,
  menuLabel,
}: {
  items: MarketingLink[];
  menuLabel: string;
}) {
  const menuRef = useRef<HTMLDetailsElement>(null);
  const firstLinkRef = useRef<HTMLAnchorElement>(null);

  return (
    <details
      ref={menuRef}
      onToggle={(event) => {
        if (event.currentTarget.open) firstLinkRef.current?.focus();
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          event.currentTarget.removeAttribute("open");
        }
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.currentTarget.removeAttribute("open");
        event.currentTarget.querySelector("summary")?.focus();
      }}
      className="group relative md:hidden"
    >
      <summary
        data-testid="marketing-menu-button"
        aria-label={menuLabel}
        aria-controls="mobile-marketing-menu"
        className="flex size-9 cursor-pointer list-none items-center justify-center overflow-hidden rounded-[18px] bg-subtle text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand [&::-webkit-details-marker]:hidden"
      >
        <Menu
          aria-hidden
          size={16}
          strokeWidth={1.8}
          className="group-open:hidden"
        />
        <X
          aria-hidden
          size={16}
          strokeWidth={1.8}
          className="hidden group-open:block"
        />
      </summary>
      <div
        id="mobile-marketing-menu"
        className="absolute top-12 right-0 z-50 hidden w-[min(326px,calc(100vw-32px))] rounded-xl border border-line bg-surface p-3 shadow-lg group-open:block"
      >
        <nav aria-label={menuLabel} className="grid gap-1">
          {items.map((item, index) => (
            <a
              key={item.href}
              ref={index === 0 ? firstLinkRef : undefined}
              href={item.href}
              onClick={() => menuRef.current?.removeAttribute("open")}
              className="flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-ink hover:bg-page focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-brand"
            >
              {item.label}
            </a>
          ))}
        </nav>
        <div className="mt-3 border-t border-line pt-3">
          <HeaderUser placement="menu" />
        </div>
      </div>
    </details>
  );
}
