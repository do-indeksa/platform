import type { PracticeCloudTask } from "./practice-cloud-types";

const TASK_ID_PATTERN = /^[a-z0-9-]{1,64}$/;
const REVISION_PATTERN = /^sha256:[a-f0-9]{64}$/;

export async function practiceTaskSetRevision(
  tasks: readonly Pick<PracticeCloudTask, "id" | "revision">[],
): Promise<string> {
  if (
    tasks.length < 1 ||
    tasks.some(
      (task) =>
        !TASK_ID_PATTERN.test(task.id) || !REVISION_PATTERN.test(task.revision),
    )
  ) {
    throw new TypeError("practice task set is invalid");
  }
  const payload = tasks
    .map((task) => `${task.id}\0${task.revision}\n`)
    .join("");
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(payload),
  );
  return `sha256:${Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")}`;
}
