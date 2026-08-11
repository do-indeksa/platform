import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SimulationRuntime } from "@/components/simulation";
import { redirect } from "@/i18n/navigation";
import { taskSetRevision } from "@/lib/content";
import { getP1Blueprint } from "@/lib/exam-blueprint";
import { buildSimulationTaskViews } from "@/lib/simulation-content";
import {
  parseSimulationRunQuery,
  simulationRunHref,
} from "@/lib/simulation-run";
import { generateVariant, resolveVariantTaskIds } from "@/lib/variant";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("simulation");
  return { title: t("inProgressTitle") };
}

export default async function NewSimulationPage({
  params,
  searchParams,
}: Props) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  const requestedVersion =
    typeof query.version === "string" ? query.version : undefined;
  const blueprint = await loadBlueprint(requestedVersion);
  const run = blueprint
    ? parseSimulationRunQuery(query, blueprint.taskCount)
    : null;
  const variant = run
    ? await resolveVariantTaskIds(run.taskIds, run.blueprintVersion)
    : null;

  if (!run || !variant) {
    const fresh = await generateVariant();
    return redirect({
      href: simulationRunHref("/simulation/new", {
        runId: crypto.randomUUID(),
        blueprintVersion: fresh.blueprint.version,
        taskIds: fresh.tasks.map(({ task }) => task.id),
      }),
      locale,
    });
  }

  const topicT = await getTranslations({ locale, namespace: "topics" });
  const tasks = await buildSimulationTaskViews(variant, topicT);

  return (
    <SimulationRuntime
      run={run}
      durationMinutes={variant.blueprint.durationMinutes}
      tasks={tasks}
      contentRevision={taskSetRevision(variant.tasks.map(({ task }) => task))}
    />
  );
}

async function loadBlueprint(version: string | undefined) {
  try {
    return await getP1Blueprint(version);
  } catch {
    return null;
  }
}
