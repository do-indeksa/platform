"use client";

import { useTranslations } from "next-intl";
import type { CheckPart, CheckResult } from "@/lib/answer";
import { MAX_ANSWER_LENGTH } from "@/lib/task-draft";

const PLACEHOLDERS = {
  value: "placeholderValue",
  values: "placeholderValues",
  interval: "placeholderInterval",
  text: "placeholderText",
} as const;

export function AnswerField({
  part,
  index,
  value,
  result,
  disabled,
  onChange,
  className = "",
  inputClassName = "",
}: {
  part: Pick<CheckPart, "label" | "kind">;
  index: number;
  value: string;
  result: CheckResult | null;
  disabled: boolean;
  onChange: (value: string) => void;
  className?: string;
  inputClassName?: string;
}) {
  const t = useTranslations("tasks");
  const id = `answer-${index}`;
  const errorId = `${id}-error`;
  const border =
    result === "correct"
      ? "border-green-500"
      : result === "incorrect"
        ? "border-red-500"
        : result === "invalid"
          ? "border-amber-500"
          : "border-zinc-300";

  return (
    <div className={`min-w-0 space-y-1 ${className}`}>
      <label htmlFor={id} className="block text-sm font-medium">
        {part.label ?? t("answerLabel")}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        disabled={disabled}
        maxLength={MAX_ANSWER_LENGTH}
        autoComplete="off"
        placeholder={t(PLACEHOLDERS[part.kind])}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={result === "incorrect" || result === "invalid"}
        aria-describedby={result === "invalid" ? errorId : undefined}
        className={`w-full max-w-sm rounded-lg border px-3 py-2 font-mono tabular-nums transition-colors disabled:bg-zinc-100 ${border} ${inputClassName}`}
      />
      {result === "invalid" && (
        <p id={errorId} className="text-sm text-amber-700">
          {t("invalidFormat")}
        </p>
      )}
    </div>
  );
}
