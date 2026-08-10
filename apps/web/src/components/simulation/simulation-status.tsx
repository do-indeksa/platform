"use client";

import { LoaderCircle, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export function RunNotice({
  message,
  href,
  action,
}: {
  message: string;
  href: string;
  action: string;
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-page px-5">
      <div className="max-w-md text-center">
        <p className="text-lg font-semibold">{message}</p>
        <Link
          href={href}
          className="mt-6 inline-flex min-h-11 items-center rounded-lg bg-brand px-5 py-3 font-semibold text-on-brand hover:bg-brand-hover"
        >
          {action}
        </Link>
      </div>
    </main>
  );
}

export function SubmissionStatus({
  label,
  description,
  error,
  retry,
}: {
  label: string;
  description?: string;
  error?: string | null;
  retry?: () => void;
}) {
  const t = useTranslations("simulation");
  return (
    <main className="flex min-h-dvh items-center justify-center bg-page px-5">
      <div className="max-w-md text-center">
        {error ? (
          <RefreshCw aria-hidden className="mx-auto h-7 w-7 text-red-600" />
        ) : (
          <LoaderCircle
            aria-hidden
            className="mx-auto h-7 w-7 animate-spin text-brand"
          />
        )}
        <h1 className="mt-5 text-2xl font-bold">{label}</h1>
        {description && (
          <p className="mt-3 leading-7 text-muted">{description}</p>
        )}
        {error && (
          <>
            <p role="alert" className="mt-3 text-sm text-red-700">
              {error}
            </p>
            <button
              type="button"
              onClick={retry}
              className="mt-6 min-h-11 rounded-lg bg-brand px-5 py-3 font-semibold text-on-brand hover:bg-brand-hover"
            >
              {t("retrySubmission")}
            </button>
          </>
        )}
      </div>
    </main>
  );
}
