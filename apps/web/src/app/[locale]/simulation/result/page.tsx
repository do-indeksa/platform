import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SimulationResult } from "@/components/simulation";
import { redirect } from "@/i18n/navigation";
import { getP1Blueprint } from "@/lib/exam-blueprint";
import { buildSimulationTaskViews } from "@/lib/simulation-content";
import { parseSimulationRunQuery } from "@/lib/simulation-run";
import { resolveVariantTaskIds } from "@/lib/variant";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("simulation");
  return { title: t("resultTitle") };
}

export default async function SimulationResultPage({
  params,
  searchParams,
}: Props) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  const requestedVersion =
    typeof query.version === "string" ? query.version : undefined;
  let blueprint;
  try {
    blueprint = await getP1Blueprint(requestedVersion);
  } catch {
    return redirect({ href: "/simulation", locale });
  }
  const run = parseSimulationRunQuery(query, blueprint.taskCount);
  const variant = run
    ? await resolveVariantTaskIds(run.taskIds, run.blueprintVersion)
    : null;
  if (!run || !variant) return redirect({ href: "/simulation", locale });
  const topicT = await getTranslations({ locale, namespace: "topics" });
  const tasks = await buildSimulationTaskViews(variant, topicT);

  return <SimulationResult run={run} tasks={tasks} />;
}
