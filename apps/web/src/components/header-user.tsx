"use client";

import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import type { components } from "@/lib/api/schema";

type User = components["schemas"]["User"];

export function HeaderUser() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>();

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/v1/me", { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then(setUser)
      .catch(() => {});
    return () => controller.abort();
  }, []);

  if (user === undefined) return <span className="block h-8 w-8" />;

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
        <span
          aria-hidden
          className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-900 text-sm font-medium text-white"
        >
          {user.name[0]}
        </span>
      )}
      <button
        onClick={async () => {
          await fetch("/api/v1/auth/logout", { method: "POST" });
          setUser(null);
          router.refresh();
        }}
        className="text-sm text-zinc-500 hover:underline"
      >
        {t("signOut")}
      </button>
    </div>
  );
}
