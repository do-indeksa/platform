"use client";

import { RefreshCw, ShieldAlert } from "lucide-react";
import { useTranslations } from "next-intl";

export function AuthBootstrapError({ retry }: { retry: () => void }) {
  const t = useTranslations("authBootstrap");

  return (
    <section
      data-testid="auth-bootstrap-error"
      data-design-status="provisional"
      aria-labelledby="auth-bootstrap-error-title"
      role="alert"
      className="fixed inset-x-4 bottom-4 z-[70] mx-auto grid max-w-xl grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-3 rounded-lg border border-amber-200 bg-surface p-4 shadow-lg md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center"
    >
      <ShieldAlert
        aria-hidden="true"
        className="mt-0.5 h-5 w-5 text-amber-700 md:mt-0"
      />
      <div className="min-w-0">
        <h2 id="auth-bootstrap-error-title" className="text-sm font-semibold">
          {t("title")}
        </h2>
        <p className="mt-1 text-sm leading-5 text-muted">{t("description")}</p>
      </div>
      <button
        type="button"
        onClick={retry}
        className="col-span-2 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold whitespace-nowrap text-on-brand hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand md:col-span-1"
      >
        <RefreshCw aria-hidden="true" className="h-4 w-4" />
        {t("retry")}
      </button>
    </section>
  );
}
