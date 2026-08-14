import { NextResponse } from "next/server";
import { readBoundedJson } from "@/lib/bounded-json";
import type { Task } from "@/lib/content";
import { isJsonMediaType } from "@/lib/json-media-type";
import {
  gradeSimulationAnswers,
  parseSimulationGradeRequest,
} from "@/lib/simulation-grade";
import { resolveSimulationTaskRevisionCandidates } from "@/lib/simulation-task-revisions";
import { resolveVariantTaskIds } from "@/lib/variant";

const MAX_REQUEST_BYTES = 32_768;
const NO_STORE_HEADERS = { "Cache-Control": "private, no-store" };

export async function POST(request: Request) {
  if (!isJsonMediaType(request.headers.get("content-type"))) {
    return json({ error: "json required" }, 415);
  }
  const body = await readBoundedJson(request, MAX_REQUEST_BYTES);
  if (body === "too-large") {
    return json({ error: "request too large" }, 413);
  }
  if (body === "invalid") return json({ error: "invalid request" }, 400);

  const input = parseSimulationGradeRequest(body);
  if (!input) return json({ error: "invalid request" }, 400);

  let variant;
  try {
    variant = await resolveVariantTaskIds(
      input.taskIds,
      input.blueprintVersion,
    );
  } catch {
    return json({ error: "variant not found" }, 404);
  }
  if (!variant) return json({ error: "variant not found" }, 404);

  const resolved =
    input.taskRevisions === undefined
      ? variant.tasks.map(({ task }) => task)
      : await resolveSimulationTaskRevisionCandidates(
          variant.tasks.map(({ task }) => task),
          input.taskRevisions,
        );
  const tasks = resolved.filter((task): task is Task => task !== undefined);
  if (tasks.length !== resolved.length) {
    return json({ error: "task revision not found" }, 404);
  }

  const results = gradeSimulationAnswers(
    tasks.map((task, index) => ({
      id: task.id,
      maxPoints: variant.tasks[index].maxPoints,
      check: task.check,
    })),
    input.answers,
  );
  if (!results) return json({ error: "answer composition mismatch" }, 400);

  const review = tasks.map((task) => ({
    taskId: task.id,
    correctAnswer: task.answer,
    solution: task.solution,
    rubric: task.rubric,
  }));

  return json({ results, review });
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}
