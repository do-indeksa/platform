import { renderMarkdown } from "./markdown";
import type {
  SimulationRenderedReviewItem,
  SimulationReviewItem,
} from "./simulation-types";

export async function renderSimulationReview(
  review: readonly SimulationReviewItem[],
): Promise<SimulationRenderedReviewItem[]> {
  return Promise.all(
    review.map(async (item) => ({
      taskId: item.taskId,
      correctAnswerHtml: await renderMarkdown(item.correctAnswer),
      solutionHtml: await renderMarkdown(item.solution),
    })),
  );
}
