import { NextResponse } from "next/server";
import {
  checkDiagnosticAnswers,
  parseDiagnosticCheckRequest,
} from "@/lib/diagnostic-check";
import { getTask } from "@/lib/content";

const MAX_REQUEST_BYTES = 4_096;
const NO_STORE_HEADERS = { "Cache-Control": "private, no-store" };

export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return json({ error: "json required" }, 415);
  }
  const body = await readBoundedJson(request);
  if (body === "too-large") {
    return json({ error: "request too large" }, 413);
  }
  if (body === "invalid") {
    return json({ error: "invalid request" }, 400);
  }

  const input = parseDiagnosticCheckRequest(body);
  if (!input) {
    return json({ error: "invalid request" }, 400);
  }
  const task = await getTask(input.topic, input.taskId);
  if (!task || task.check.length !== input.answers.length) {
    return json({ error: "task not found" }, 404);
  }

  return json({
    outcome: checkDiagnosticAnswers(task.check, input.answers),
  });
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

async function readBoundedJson(
  request: Request,
): Promise<unknown | "invalid" | "too-large"> {
  if (!request.body) return "invalid";
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_REQUEST_BYTES) {
      await reader.cancel();
      return "too-large";
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return "invalid";
  }
}
