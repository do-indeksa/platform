import { useTranslations } from "next-intl";

export default function Loading() {
  const t = useTranslations("diagnostic");
  return (
    <main className="flex min-h-dvh items-center justify-center px-5">
      <p className="animate-pulse text-muted">{t("loading")}</p>
    </main>
  );
}
