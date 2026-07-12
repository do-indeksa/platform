import { useTranslations } from "next-intl";

export default function Loading() {
  const t = useTranslations("simulation");
  return (
    <main className="mx-auto max-w-2xl p-8">
      <p className="animate-pulse text-zinc-500">{t("assembling")}</p>
    </main>
  );
}
