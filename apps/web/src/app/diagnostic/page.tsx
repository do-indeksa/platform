import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("diagnostic");
  return { title: t("title"), description: t("description") };
}

export default async function DiagnosticPage() {
  const t = await getTranslations("diagnostic");
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="mb-2 text-3xl font-bold">{t("title")}</h1>
      <p className="mb-1 text-zinc-600">{t("intro1")}</p>
      <p className="mb-8 text-zinc-600">{t("intro2")}</p>
      <Link
        href="/diagnostic/new"
        className="inline-block rounded-full bg-zinc-900 px-6 py-3 font-medium text-white transition-colors hover:bg-zinc-700"
      >
        {t("startCta")}
      </Link>
    </main>
  );
}
