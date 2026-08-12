"use client";

import { Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { RenderedMarkdown } from "@/components/rendered-markdown";
import { AnswerField } from "@/components/task-check/answer-field";
import { TaskProblemReport } from "@/components/task-problem-report";
import type { CheckPart } from "@/lib/answer";
import type { TaskCheckState } from "@/components/task-check/use-task-check-state";

export function QuestionPanel({
  ordinal,
  statementHtml,
  statementVisible,
  source,
  check,
  state,
  checking,
  checkerUnavailable,
  reportHref,
  reportAccessibleLabel,
  onAnswerChange,
  onVerify,
}: {
  ordinal: number;
  statementHtml: string;
  statementVisible: boolean;
  source: string;
  check: CheckPart[];
  state: TaskCheckState;
  checking: boolean;
  checkerUnavailable: boolean;
  reportHref: string;
  reportAccessibleLabel: string;
  onAnswerChange: (index: number, value: string) => void;
  onVerify: () => void;
}) {
  const t = useTranslations("tasks");
  const locked = state.solved || state.burned;

  return (
    <section
      data-testid="task-question-panel"
      className="flex min-h-[470px] min-w-0 flex-col gap-[18px] rounded-[18px] border border-line bg-surface p-6 md:min-h-[420px] md:p-7 xl:min-h-[500px]"
    >
      <div className="flex min-h-[58px] min-w-0 flex-col items-start justify-between gap-2 text-[12px] leading-[1.45] font-medium text-brand-ink md:min-h-[34px] md:flex-row md:gap-4">
        <span className="inline-flex min-w-0 items-center gap-2">
          <span>{t("taskOrdinal", { ordinal })}</span>
          <span aria-hidden="true">·</span>
          {statementVisible ? (
            <Eye aria-hidden="true" className="size-3.5 shrink-0" />
          ) : (
            <EyeOff aria-hidden="true" className="size-3.5 shrink-0" />
          )}
          <span>
            {statementVisible ? t("conditionVisible") : t("conditionHidden")}
          </span>
        </span>
        <TaskProblemReport
          href={reportHref}
          label={t("reportProblem")}
          accessibleLabel={reportAccessibleLabel}
          variant="workspace"
        />
      </div>

      {statementVisible ? (
        <RenderedMarkdown
          html={statementHtml}
          openImageLabel={t("openImage")}
          closeImageLabel={t("closeImage")}
          className="text-[14px] leading-[1.45] text-ink [&_.katex-display]:my-4 [&_.katex-display_.katex]:text-[28px] [&>p:first-child]:text-[16px] [&>p:first-child]:font-medium"
        />
      ) : (
        <p
          role="status"
          className="flex min-h-28 items-center justify-center rounded-[12px] border border-dashed border-line bg-page px-4 text-center text-[13px] leading-[1.45] text-muted"
        >
          {t("conditionHiddenBody")}
        </p>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          onVerify();
        }}
        aria-busy={checking}
        className="space-y-3"
      >
        {check.length === 1 ? (
          <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,650px)_150px] lg:items-end xl:grid-cols-[minmax(0,410px)_150px]">
            <AnswerField
              part={check[0]}
              index={0}
              value={state.answers[0]}
              result={state.results?.[0] ?? null}
              disabled={locked || checking}
              onChange={(value) => onAnswerChange(0, value)}
              inputClassName="h-12 max-w-none rounded-[11px] px-[14px] py-3 font-sans text-[13px]"
            />
            <CheckButton locked={locked} checking={checking} />
          </div>
        ) : (
          <>
            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
              {check.map((part, index) => (
                <AnswerField
                  key={`${part.label ?? part.kind}-${index}`}
                  part={part}
                  index={index}
                  value={state.answers[index]}
                  result={state.results?.[index] ?? null}
                  disabled={locked || checking}
                  onChange={(value) => onAnswerChange(index, value)}
                  inputClassName="h-12 max-w-none rounded-[11px] px-[14px] py-3 font-sans text-[13px]"
                />
              ))}
            </div>
            <CheckButton locked={locked} checking={checking} />
          </>
        )}
        {checkerUnavailable && (
          <p role="alert" className="text-[13px] text-red-700">
            {t("checkerUnavailable")}
          </p>
        )}
      </form>

      <div className="border-t border-line pt-3 text-[11px] leading-[1.45] text-muted">
        {t("sourceLabel", { source })}
      </div>
    </section>
  );
}

function CheckButton({
  locked,
  checking,
}: {
  locked: boolean;
  checking: boolean;
}) {
  const t = useTranslations("tasks");
  return (
    <button
      type="submit"
      disabled={locked || checking}
      className="inline-flex h-12 w-full items-center justify-center rounded-[11px] bg-brand px-4 text-[13px] leading-[1.45] font-medium text-on-brand transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-40 lg:h-[46px] lg:w-[150px]"
    >
      {checking ? t("checkingCta") : t("checkCta")}
    </button>
  );
}
