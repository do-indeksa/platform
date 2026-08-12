"use client";

import Image from "next/image";
import { CircleHelp } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  trainingBuilderDifficulties,
  type TrainingBuilderDifficulty,
} from "@/lib/training-builder";

export function TrainingSettings({
  difficulty,
  onlyNew,
  shuffle,
  prioritizeMistakes,
  journalStatus,
  onDifficultyChange,
  onOnlyNewChange,
  onShuffleChange,
  onPrioritizeMistakesChange,
}: {
  difficulty: TrainingBuilderDifficulty;
  onlyNew: boolean;
  shuffle: boolean;
  prioritizeMistakes: boolean;
  journalStatus: "loading" | "guest" | "synced" | "degraded";
  onDifficultyChange: (value: TrainingBuilderDifficulty) => void;
  onOnlyNewChange: (value: boolean) => void;
  onShuffleChange: (value: boolean) => void;
  onPrioritizeMistakesChange: (value: boolean) => void;
}) {
  const t = useTranslations("trainingBuilder");

  return (
    <section
      aria-labelledby="training-settings-title"
      className="h-[320px] overflow-hidden rounded-[14px] border border-line bg-surface px-4 py-[18px]"
    >
      <h2
        id="training-settings-title"
        className="text-[22px] leading-[30px] font-semibold text-ink"
      >
        {t("settingsTitle")}
      </h2>

      <div className="mt-3 flex items-center gap-1.5 text-sm leading-5 text-ink">
        <span>{t("difficultyLabel")}</span>
        <CircleHelp
          aria-label={t("difficultyInfo")}
          role="img"
          size={14}
          strokeWidth={1.6}
        />
      </div>
      <div
        role="group"
        aria-label={t("difficultyLabel")}
        className="mt-2 flex h-10 w-full"
      >
        {trainingBuilderDifficulties.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={difficulty === value}
            onClick={() => onDifficultyChange(value)}
            className={`h-10 min-w-0 flex-1 rounded-[10px] px-2 text-sm leading-5 font-semibold transition-colors ${
              difficulty === value
                ? "bg-brand text-on-brand"
                : "border border-line bg-surface text-ink hover:border-brand"
            }`}
          >
            {t(`difficulty.${value}`)}
          </button>
        ))}
      </div>

      <div className="mt-3 grid">
        <TrainingToggle
          checked={onlyNew}
          title={t("onlyNew.title")}
          description={t("onlyNew.description")}
          onChange={onOnlyNewChange}
        />
        <TrainingToggle
          checked={shuffle}
          title={t("shuffle.title")}
          description={t("shuffle.description")}
          onChange={onShuffleChange}
        />
        <TrainingToggle
          checked={prioritizeMistakes}
          title={t("mistakes.title")}
          description={t("mistakes.description")}
          onChange={onPrioritizeMistakesChange}
        />
      </div>

      {journalStatus === "loading" && (
        <p role="status" className="mt-2 text-xs leading-4 text-muted">
          {t("attemptsLoading")}
        </p>
      )}
      {journalStatus === "degraded" && (
        <p role="status" className="mt-2 text-xs leading-4 text-muted">
          {t("attemptsDegraded")}
        </p>
      )}
    </section>
  );
}

function TrainingToggle({
  checked,
  title,
  description,
  onChange,
}: {
  checked: boolean;
  title: string;
  description: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-3">
      <span className="min-w-0">
        <span className="block truncate text-sm leading-5 text-ink">
          {title}
        </span>
        <span className="block truncate text-xs leading-4 font-medium tracking-[0.2px] text-muted">
          {description}
        </span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={title}
        onClick={() => onChange(!checked)}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
      >
        <Image
          aria-hidden
          src={
            checked
              ? "/training-builder/toggle-on.svg"
              : "/training-builder/toggle-off.svg"
          }
          alt=""
          width={44}
          height={24}
          className="h-6 w-11"
        />
      </button>
    </div>
  );
}
