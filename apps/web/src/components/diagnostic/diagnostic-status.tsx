"use client";

import { LoaderCircle, LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export function LoadingState({ label }: { label: string }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-5">
      <p className="flex items-center gap-3 text-muted">
        <LoaderCircle aria-hidden="true" className="h-5 w-5 animate-spin" />
        {label}
      </p>
    </main>
  );
}

export function RunNotice({
  message,
  href,
  action,
}: {
  message: string;
  href: string;
  action: string;
}) {
  const t = useTranslations("diagnostic");
  return (
    <main className="flex min-h-dvh items-center justify-center px-5">
      <div className="max-w-md text-center">
        <LogOut aria-hidden="true" className="mx-auto h-8 w-8 text-brand" />
        <p className="mt-4 text-lg font-medium">{message}</p>
        <Link
          href={href}
          className="mt-6 inline-flex min-h-12 items-center rounded-lg bg-brand px-5 py-3 font-semibold text-on-brand hover:bg-brand-hover"
        >
          {action}
        </Link>
        <div className="mt-4">
          <Link
            href="/diagnostic"
            className="text-sm text-muted hover:underline"
          >
            {t("back")}
          </Link>
        </div>
      </div>
    </main>
  );
}
