"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { LogIn, LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { useUser } from "@/components/user-provider";

export function HeaderUser({
  placement = "header",
}: {
  placement?: "header" | "menu";
}) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const { user, signingOut, signOut } = useUser();
  const inMenu = placement === "menu";

  if (user === null) {
    return (
      <a
        href={`/api/v1/auth/google?redirect=${encodeURIComponent(pathname)}`}
        title={!inMenu ? t("signIn") : undefined}
        className={
          inMenu
            ? "flex min-h-11 w-full items-center gap-3 rounded-lg border border-line px-3 text-sm font-semibold text-ink transition-colors hover:bg-page focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            : "flex h-11 items-center justify-center gap-2 rounded-full border border-line px-3 text-sm font-semibold text-ink transition-colors hover:border-brand hover:text-brand-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        }
      >
        <LogIn aria-hidden size={18} strokeWidth={1.8} />
        <span className={inMenu ? undefined : "hidden xl:inline"}>
          {t("signIn")}
        </span>
        {!inMenu && <span className="sr-only xl:hidden">{t("signIn")}</span>}
      </a>
    );
  }

  return (
    <div
      className={
        inMenu
          ? "flex min-h-11 items-center gap-3"
          : "flex min-w-0 items-center gap-2"
      }
    >
      <UserAvatar name={user.name} pictureUrl={user.pictureUrl} />
      <span
        className={
          inMenu ? "min-w-0 flex-1 truncate text-sm font-semibold" : "sr-only"
        }
      >
        {user.name}
      </span>
      <button
        type="button"
        onClick={signOut}
        disabled={signingOut}
        title={!inMenu ? t("signOut") : undefined}
        className={
          inMenu
            ? "flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium text-muted transition-colors hover:bg-page hover:text-ink disabled:opacity-50"
            : "flex h-11 w-11 items-center justify-center rounded-full text-muted transition-colors hover:bg-subtle hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50"
        }
      >
        <LogOut aria-hidden size={18} strokeWidth={1.8} />
        <span className={inMenu ? undefined : "sr-only"}>{t("signOut")}</span>
      </button>
    </div>
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
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-subtle text-sm font-semibold text-brand-ink"
      >
        {name.trim().charAt(0).toLocaleUpperCase() || "?"}
      </span>
      <span className="sr-only">{name}</span>
    </>
  );
}
