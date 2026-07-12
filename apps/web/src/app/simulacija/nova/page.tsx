import type { Metadata } from "next";
import { SimulationRuntime } from "@/components/simulation-runtime";
import { getTopics } from "@/lib/content";
import { renderMarkdown } from "@/lib/markdown";
import type { SimulationTask } from "@/lib/simulation-store";
import { generateVariant } from "@/lib/variant";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Simulacija u toku — Do indeksa",
};

export default async function NewSimulationPage() {
  const [variant, topics] = await Promise.all([generateVariant(), getTopics()]);
  const topicNames = new Map(topics.map((topic) => [topic.slug, topic.name]));
  const tasks: SimulationTask[] = await Promise.all(
    variant.map(async (task) => ({
      id: task.id,
      slot: task.slot,
      topicName: topicNames.get(task.topic) ?? task.topic,
      statementHtml: await renderMarkdown(task.statement),
      solutionHtml: await renderMarkdown(task.solution),
      answer: task.answer,
    })),
  );
  return (
    <main className="mx-auto max-w-2xl p-8">
      <SimulationRuntime tasks={tasks} />
    </main>
  );
}
