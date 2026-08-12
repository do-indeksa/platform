"use client";

import { useTranslations } from "next-intl";
import { RenderedMarkdown } from "@/components/rendered-markdown";
import type { TaskCheckState } from "@/components/task-check/use-task-check-state";

export function HelpPanel({
  state,
  hintsHtml,
  solutionHtml,
  onRetry,
  onShowHint,
  onNextHelp,
  onShowSolution,
}: {
  state: TaskCheckState;
  hintsHtml: readonly string[];
  solutionHtml: string;
  onRetry: () => void;
  onShowHint: () => void;
  onNextHelp: () => void;
  onShowSolution: () => void;
}) {
  const t = useTranslations("tasks");

  return (
    <aside
      data-testid="task-help-panel"
      className="min-h-[380px] min-w-0 rounded-[18px] border border-line bg-surface p-5 lg:min-h-[260px] lg:p-6 xl:min-h-[420px] xl:p-5"
    >
      <h2 className="mb-[14px] text-[18px] leading-[1.4] font-semibold text-ink">
        {t("helpTitle")}
      </h2>
      <div aria-live="polite">
        {state.view === "solution" ? (
          <HelpContent tone="brand" title={t("solutionTitle")}>
            <RenderedMarkdown
              html={solutionHtml}
              openImageLabel={t("openImage")}
              closeImageLabel={t("closeImage")}
              className="text-[13px] leading-[1.5]"
            />
          </HelpContent>
        ) : state.view === "correct" ? (
          <HelpContent tone="success" title={t("correctTitle")}>
            <p>{t("correctBody")}</p>
            <ActionButton onClick={onShowSolution}>
              {t("viewSolution")}
            </ActionButton>
          </HelpContent>
        ) : state.view === "hint" ? (
          <HelpContent
            tone="warning"
            title={t("hintTitle", { level: state.hintsShown })}
          >
            {hintsHtml.slice(0, state.hintsShown).map((html, index) => (
              <RenderedMarkdown
                key={index}
                html={html}
                openImageLabel={t("openImage")}
                closeImageLabel={t("closeImage")}
                className="text-[13px] leading-[1.5]"
              />
            ))}
            <div className="flex flex-wrap gap-2">
              <ActionButton onClick={onNextHelp}>
                {state.hintsShown < hintsHtml.length
                  ? t("nextHint")
                  : t("showFullSolution")}
              </ActionButton>
              <ActionButton onClick={onRetry} subdued>
                {t("backToSolving")}
              </ActionButton>
              {state.hintsShown < hintsHtml.length && (
                <ActionButton onClick={onShowSolution} subdued>
                  {t("showFullSolution")}
                </ActionButton>
              )}
            </div>
          </HelpContent>
        ) : (
          <div className="space-y-3">
            {state.view === "incorrect" && (
              <HelpContent tone="danger" title={t("incorrectTitle")}>
                <p>{t("incorrectBody")}</p>
                <ActionButton onClick={onRetry}>{t("retry")}</ActionButton>
              </HelpContent>
            )}
            <HelpAvailability
              attempted={state.attempted}
              hintsHtml={hintsHtml}
              onShowHint={onShowHint}
              onShowSolution={onShowSolution}
            />
          </div>
        )}
      </div>
    </aside>
  );
}

function HelpAvailability({
  attempted,
  hintsHtml,
  onShowHint,
  onShowSolution,
}: {
  attempted: boolean;
  hintsHtml: readonly string[];
  onShowHint: () => void;
  onShowSolution: () => void;
}) {
  const t = useTranslations("tasks");
  return (
    <div className="flex min-w-0 flex-col gap-3 lg:flex-row xl:flex-col">
      {hintsHtml.map((_, index) => {
        const available = attempted && index === 0;
        return (
          <div
            key={index}
            className="min-h-[74px] min-w-0 flex-1 rounded-[12px] border border-line bg-surface p-[14px] lg:min-h-24 lg:w-[250px] lg:flex-none xl:min-h-[74px] xl:w-full"
          >
            <p className="text-[13px] leading-[1.4] font-semibold text-ink">
              {t("helpItemTitle", { level: index + 1 })} ·{" "}
              {available ? t("available") : t("locked")}
            </p>
            {available ? (
              <button
                type="button"
                onClick={onShowHint}
                className="mt-1 min-h-6 text-left text-[11px] leading-[1.4] font-medium text-brand-ink underline-offset-2 hover:underline"
              >
                {t("showHint")}
              </button>
            ) : (
              <p className="mt-1 text-[11px] leading-[1.4] text-muted">
                {index === 0 ? t("helpAfterAttempt") : t("helpAfterPrevious")}
              </p>
            )}
          </div>
        );
      })}
      <div className="min-h-[110px] min-w-0 flex-1 rounded-[12px] border border-brand-ink bg-subtle p-[14px] lg:min-h-32 lg:min-w-0 xl:min-h-32 xl:w-full">
        <p className="text-[13px] leading-[1.4] font-semibold text-brand-ink">
          {attempted ? t("solutionAvailable") : t("solutionHidden")}
        </p>
        {attempted ? (
          <button
            type="button"
            onClick={onShowSolution}
            className="mt-1 min-h-6 text-left text-[11px] leading-[1.4] font-medium text-brand-ink underline-offset-2 hover:underline"
          >
            {t("showFullSolution")}
          </button>
        ) : (
          <p className="mt-1 text-[11px] leading-[1.4] text-muted">
            {t("solutionAfterAttempt")}
          </p>
        )}
      </div>
    </div>
  );
}

function HelpContent({
  tone,
  title,
  children,
}: {
  tone: "danger" | "warning" | "success" | "brand";
  title: string;
  children: React.ReactNode;
}) {
  const tones = {
    danger: "border-red-200 bg-red-50",
    warning: "border-amber-200 bg-amber-50",
    success: "border-emerald-200 bg-emerald-50",
    brand: "border-brand-ink bg-subtle",
  } as const;
  return (
    <div
      className={`space-y-3 rounded-[12px] border p-[14px] text-[13px] leading-[1.5] ${tones[tone]}`}
    >
      <p className="font-semibold">{title}</p>
      {children}
    </div>
  );
}

function ActionButton({
  onClick,
  subdued = false,
  children,
}: {
  onClick: () => void;
  subdued?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-10 rounded-[10px] border px-3 py-2 text-[12px] font-medium transition-colors ${
        subdued
          ? "border-line bg-surface text-ink hover:bg-page"
          : "border-brand bg-brand text-on-brand hover:bg-brand-hover"
      }`}
    >
      {children}
    </button>
  );
}
