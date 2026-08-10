import type { SimulationTaskView } from "./simulation-types";
import { renderMarkdown } from "./markdown";
import type { GeneratedVariant } from "./variant";

export async function buildSimulationTaskViews(
  variant: GeneratedVariant,
  topicName: (topic: string) => string,
): Promise<SimulationTaskView[]> {
  return Promise.all(
    variant.tasks.map(async ({ examPosition, maxPoints, task }) => ({
      id: task.id,
      slot: task.slot,
      examPosition,
      maxPoints,
      topic: task.topic,
      topicName: topicName(task.topic),
      statementHtml: await renderMarkdown(task.statement),
      fields: task.check.map(({ label, kind }) => ({ label, kind })),
    })),
  );
}
