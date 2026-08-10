import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { KnowledgeMap } from "@/components/knowledge-map";
import { SimulationHistory } from "@/components/simulation-history";
import { getTopics } from "@/lib/content";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("prep");
  return { title: t("title"), description: t("description") };
}

export default async function PrepPage() {
  const [topics, t] = await Promise.all([getTopics(), getTranslations("prep")]);
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="mb-2 text-3xl font-bold">{t("title")}</h1>
      <p className="mb-8 text-zinc-600">{t("mapIntro")}</p>
      <KnowledgeMap topics={topics} />
      <SimulationHistory />
    </main>
  );
}
