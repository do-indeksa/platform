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
  const [user, setUser] = useState<User | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/v1/me", { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: User | null) => setUser(data))
      .catch(() => {});
    return () => controller.abort();
  }, []);

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
        onClick={async () => {
          setSigningOut(true);
          try {
            const res = await fetch("/api/v1/auth/logout", { method: "POST" });
            if (res.ok) {
              setUser(null);
              router.refresh();
            }
          } catch {
          } finally {
            setSigningOut(false);
          }
        }}
        disabled={signingOut}
        className="text-sm text-zinc-500 hover:underline disabled:opacity-50"
      >
        {t("signOut")}
      </button>
    </div>
  );
}
