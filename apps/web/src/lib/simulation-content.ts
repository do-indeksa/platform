import type { SimulationTaskView } from "./simulation-types";
import { renderMarkdown } from "./markdown";
import type { GeneratedVariant, GeneratedVariantTask } from "./variant";

export async function buildSimulationTaskViews(
  variant: GeneratedVariant,
  topicName: (topic: string) => string,
): Promise<SimulationTaskView[]> {
  return Promise.all(
    variant.tasks.map((item) => buildSimulationTaskView(item, topicName)),
  );
}

export async function buildSimulationTaskView(
  { examPosition, maxPoints, task }: GeneratedVariantTask,
  topicName: (topic: string) => string,
): Promise<SimulationTaskView> {
  return {
    id: task.id,
    revision: task.revision,
    slot: task.slot,
    examPosition,
    maxPoints,
    topic: task.topic,
    topicName: topicName(task.topic),
    statementHtml: await renderMarkdown(task.statement),
    fields: task.check.map(({ label, kind }) => ({ label, kind })),
  };
}
