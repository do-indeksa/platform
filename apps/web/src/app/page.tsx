import Link from "next/link";
import { getTranslations } from "next-intl/server";

export default async function Home() {
  const t = await getTranslations("home");
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-4xl font-bold">Do indeksa</h1>
      <p className="max-w-md text-lg text-zinc-600">{t("tagline")}</p>
      <div className="flex flex-wrap justify-center gap-3">
        <Link
          href="/tasks"
          className="rounded-full bg-zinc-900 px-6 py-3 font-medium text-white transition-colors hover:bg-zinc-700"
        >
          {t("tasksCta")}
        </Link>
        <Link
          href="/simulation"
          className="rounded-full border border-zinc-300 px-6 py-3 font-medium transition-colors hover:border-zinc-500"
        >
          {t("simulationCta")}
        </Link>
        <Link
          href="/calculator"
          className="rounded-full border border-zinc-300 px-6 py-3 font-medium transition-colors hover:border-zinc-500"
        >
          {t("calculatorCta")}
        </Link>
      </div>
    </main>
  );
}
