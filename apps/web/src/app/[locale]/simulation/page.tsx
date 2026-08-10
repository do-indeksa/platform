import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SimulationEntry } from "@/components/simulation";
import { simulationRunHref } from "@/lib/simulation-run";
import { generateVariant } from "@/lib/variant";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("simulation");
  return { title: t("title"), description: t("description") };
}

export default async function SimulationPage() {
  const variant = await generateVariant();
  const freshStartHref = simulationRunHref("/simulation/new", {
    runId: crypto.randomUUID(),
    blueprintVersion: variant.blueprint.version,
    taskIds: variant.tasks.map(({ task }) => task.id),
  });

  return (
    <SimulationEntry
      freshStartHref={freshStartHref}
      taskCount={variant.blueprint.taskCount}
      durationMinutes={variant.blueprint.durationMinutes}
      maxPoints={variant.blueprint.maxPoints}
    />
  );
}
