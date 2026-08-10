import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ExamCatalog } from "@/components/exam-catalog";
import { parseExamQuery } from "@/lib/exam-catalog";
import { getFtnCatalog } from "@/lib/guide";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("examCatalog");
  return { title: t("metadataTitle"), description: t("metadataDescription") };
}

export default async function ExamsPage({ searchParams }: Props) {
  const [catalog, params] = await Promise.all([getFtnCatalog(), searchParams]);

  return (
    <ExamCatalog catalog={catalog} initialQuery={parseExamQuery(params.q)} />
  );
}
