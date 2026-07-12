import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { SimulationHistory } from "@/components/simulation-history";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("simulation");
  return { title: t("title"), description: t("description") };
}

export default async function SimulationPage() {
  const t = await getTranslations("simulation");
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="mb-2 text-3xl font-bold">{t("title")}</h1>
      <p className="mb-1 text-zinc-600">{t("intro1")}</p>
      <p className="mb-8 text-zinc-600">{t("intro2")}</p>
      <Link
        href="/simulation/new"
        className="inline-block rounded-full bg-zinc-900 px-6 py-3 font-medium text-white transition-colors hover:bg-zinc-700"
      >
        {t("startCta")}
      </Link>
      <SimulationHistory />
    </main>
  );
}
