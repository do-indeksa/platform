"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useUser } from "@/components/user-provider";

export function HeaderUser() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const { user, signingOut, signOut } = useUser();

  if (user === null) {
    return (
      <a
        href={`/api/v1/auth/google?redirect=${encodeURIComponent(pathname)}`}
        className="rounded-full border border-zinc-300 px-4 py-1.5 text-sm font-medium transition-colors hover:border-zinc-500"
      >
        {t("signIn")}
      </a>
    );
  }

  return (
    <div className="flex items-center gap-3">
      {user.pictureUrl ? (
        <Image
          src={user.pictureUrl}
          alt={user.name}
          width={32}
          height={32}
          className="rounded-full"
        />
      ) : (
        <>
          <span
            aria-hidden
            className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-900 text-sm font-medium text-white"
          >
            {user.name[0]}
          </span>
          <span className="sr-only">{user.name}</span>
        </>
      )}
      <button
        onClick={signOut}
        disabled={signingOut}
        className="text-sm text-zinc-500 hover:underline disabled:opacity-50"
      >
        {t("signOut")}
      </button>
    </div>
  );
}
