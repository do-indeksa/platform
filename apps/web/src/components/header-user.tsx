"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { LogIn, LogOut } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useUser } from "@/components/user-provider";

export function HeaderUser({
  placement = "header",
}: {
  placement?: "header" | "marketing" | "menu";
}) {
  const t = useTranslations("nav");
  const locale = useLocale();
  const pathname = usePathname();
  const { user, loading, signingOut, signOut } = useUser();
  const inMenu = placement === "menu";
  const inMarketing = placement === "marketing";
  const headerWidth = locale === "ru" ? "w-24" : "w-[85px]";
  const nameWidth = locale === "ru" ? "w-12" : "w-[37px]";

  if (loading && !inMenu) {
    if (inMarketing) {
      return (
        <span
          aria-hidden
          className="block h-[52px] w-[92px] animate-pulse rounded-xl border border-line bg-surface"
        />
      );
    }
    return (
      <span
        aria-hidden
        className={`flex h-11 items-center gap-3 ${headerWidth}`}
      >
        <span className="h-9 w-9 animate-pulse rounded-full bg-subtle" />
        <span className={`h-3 animate-pulse rounded bg-subtle ${nameWidth}`} />
      </span>
    );
  }

  if (user === null) {
    return (
      <a
        href={`/api/v1/auth/google?redirect=${encodeURIComponent(pathname)}`}
        className={
          inMenu
            ? "flex min-h-11 w-full items-center gap-3 rounded-lg border border-line px-3 text-sm font-semibold text-ink transition-colors hover:bg-page focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            : inMarketing
              ? "inline-flex min-h-[52px] items-center justify-center rounded-xl border border-line bg-surface p-4 text-[15px] leading-5 font-semibold whitespace-nowrap text-ink hover:bg-page focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              : "flex h-11 items-center gap-3 text-[13px] font-medium whitespace-nowrap text-ink focus-visible:rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        }
      >
        {!inMarketing && (
          <span
            className={
              inMenu
                ? undefined
                : "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-subtle"
            }
          >
            <LogIn aria-hidden size={inMenu ? 18 : 16} strokeWidth={1.8} />
          </span>
        )}
        <span>{t("signIn")}</span>
      </a>
    );
  }

  if (inMenu) {
    return (
      <div className="grid gap-2">
        <div className="flex min-h-11 items-center gap-3 px-3">
          <UserAvatar name={user.name} pictureUrl={user.pictureUrl} />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">
            {user.name}
          </span>
        </div>
        <button
          type="button"
          onClick={signOut}
          disabled={signingOut}
          className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted transition-colors hover:bg-page hover:text-ink disabled:opacity-50"
        >
          <LogOut aria-hidden size={18} strokeWidth={1.8} />
          {t("signOut")}
        </button>
      </div>
    );
  }

  return (
    <details className={`group relative ${headerWidth}`}>
      <summary
        className={`flex h-11 cursor-pointer list-none items-center gap-3 text-[13px] font-medium whitespace-nowrap text-ink focus-visible:rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand [&::-webkit-details-marker]:hidden ${headerWidth}`}
      >
        <UserAvatar name={user.name} pictureUrl={user.pictureUrl} />
        <span className={`truncate ${nameWidth}`}>{user.name}</span>
      </summary>
      <div className="absolute top-12 right-0 z-50 min-w-44 rounded-lg border border-line bg-surface p-1.5 shadow-lg">
        <button
          type="button"
          onClick={signOut}
          disabled={signingOut}
          className="flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-sm font-medium text-muted transition-colors hover:bg-page hover:text-ink disabled:opacity-50"
        >
          <LogOut aria-hidden size={18} strokeWidth={1.8} />
          {t("signOut")}
        </button>
      </div>
    </details>
  );
}

function UserAvatar({
  name,
  pictureUrl,
}: {
  name: string;
  pictureUrl?: string;
}) {
  if (pictureUrl) {
    return (
      <Image
        src={pictureUrl}
        alt={name}
        width={36}
        height={36}
        className="h-9 w-9 shrink-0 rounded-full object-cover"
      />
    );
  }

  return (
    <>
      <span
        aria-hidden
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-subtle text-sm font-medium text-ink"
      >
        {name.trim().charAt(0).toLocaleUpperCase() || "?"}
      </span>
      <span className="sr-only">{name}</span>
    </>
  );
}
