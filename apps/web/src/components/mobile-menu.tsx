"use client";

import { Menu, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { MobileMenuNavigation } from "@/components/app-navigation";
import { HeaderUser } from "@/components/header-user";
import { LanguageSwitcher } from "@/components/language-switcher";

export function MobileMenu() {
  const [open, setOpen] = useState(false);
  const t = useTranslations("nav");

  return (
    <div className="md:hidden">
      <button
        type="button"
        data-testid="mobile-menu-button"
        aria-label={t("menu")}
        aria-expanded={open}
        aria-controls="mobile-app-menu"
        onClick={() => setOpen((current) => !current)}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-subtle text-ink transition-colors hover:bg-subtle-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        {open ? (
          <X aria-hidden size={16} strokeWidth={1.8} />
        ) : (
          <Menu aria-hidden size={16} strokeWidth={1.8} />
        )}
      </button>
      {open && (
        <div
          id="mobile-app-menu"
          data-design-status="provisional"
          className="fixed inset-x-0 top-16 z-50 max-h-[calc(100dvh-64px)] overflow-y-auto border-b border-line bg-surface px-4 py-4 shadow-lg"
        >
          <MobileMenuNavigation onNavigate={() => setOpen(false)} />
          <div className="mt-4 border-t border-line pt-4">
            <p className="mb-2 text-xs font-semibold text-muted">
              {t("language")}
            </p>
            <LanguageSwitcher />
          </div>
          <div className="mt-4 border-t border-line pt-4">
            <p className="mb-2 text-xs font-semibold text-muted">
              {t("account")}
            </p>
            <HeaderUser placement="menu" />
          </div>
        </div>
      )}
    </div>
  );
}
