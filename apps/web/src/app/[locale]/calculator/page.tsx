import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ScoreCalculator } from "@/components/score-calculator";
import { getFtnCutoffs } from "@/lib/guide";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("calculator");
  return { title: t("title"), description: t("description") };
}

export default async function CalculatorPage() {
  const t = await getTranslations("calculator");
  const { source, programs } = await getFtnCutoffs();
  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="mb-2 text-3xl font-bold">{t("heading")}</h1>
      <p className="mb-1 text-zinc-600">{t("formula")}</p>
      <p className="mb-8 text-zinc-600">{t("minimums")}</p>
      <ScoreCalculator programs={programs} />
      <p className="mt-8 text-sm text-zinc-500">
        {t.rich("disclaimer", {
          link: (chunks) => (
            <a href={source} className="underline hover:text-zinc-700">
              {chunks}
            </a>
          ),
        })}
      </p>
    </main>
  );
}
