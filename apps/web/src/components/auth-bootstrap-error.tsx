"use client";

import { RefreshCw, ShieldAlert } from "lucide-react";
import { useTranslations } from "next-intl";

export function AuthBootstrapError({ retry }: { retry: () => void }) {
  const t = useTranslations("authBootstrap");

  return (
    <main
      data-testid="auth-bootstrap-error"
      data-design-status="provisional"
      aria-labelledby="auth-bootstrap-error-title"
      className="flex min-h-dvh items-center justify-center px-5 py-12"
    >
      <div className="max-w-md text-center">
        <ShieldAlert
          aria-hidden="true"
          className="mx-auto h-8 w-8 text-amber-700"
        />
        <h1 id="auth-bootstrap-error-title" className="mt-5 text-2xl font-bold">
          {t("title")}
        </h1>
        <p role="alert" className="mt-3 leading-7 text-muted">
          {t("description")}
        </p>
        <button
          type="button"
          onClick={retry}
          className="mt-7 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brand px-5 py-3 font-semibold text-on-brand hover:bg-brand-hover"
        >
          <RefreshCw aria-hidden="true" className="h-4 w-4" />
          {t("retry")}
        </button>
      </div>
    </main>
  );
}
