import { useTranslations } from "next-intl";

export function Difficulty({ level }: { level: number }) {
  const t = useTranslations("tasks");
  return (
    <span
      role="img"
      aria-label={t("difficulty", { level })}
      className="text-sm text-amber-500"
    >
      <span aria-hidden="true">{"★".repeat(level)}</span>
      <span aria-hidden="true" className="text-zinc-300">
        {"★".repeat(5 - level)}
      </span>
    </span>
  );
}
