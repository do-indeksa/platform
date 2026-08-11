import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { auditVerificationRecords } from "../src/verification.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

test("verified topics have a versioned review record", async () => {
  assert.deepEqual(
    await auditVerificationRecords(
      path.join(repoRoot, "content/tasks"),
      path.join(repoRoot, "content/reviews"),
    ),
    { reviewCount: 3, verifiedTaskCount: 15, verifiedTopicCount: 5 },
  );
});

test("a topic review must cover every task in the topic", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "do-indeksa-review-"));
  const tasks = path.join(root, "tasks", "tema");
  const reviews = path.join(root, "reviews");
  await fs.mkdir(tasks, { recursive: true });
  await fs.mkdir(reviews);
  try {
    await Promise.all([
      writeTask(path.join(tasks, "a.md"), "a", "verified"),
      writeTask(path.join(tasks, "b.md"), "b", "verified"),
      fs.writeFile(
        path.join(reviews, "partial.md"),
        `---\nid: partial\nverifiedAt: '2026-08-11'\nmethods:\n  - source-selector-match\n  - independent-recalculation\n  - machine-check-roundtrip\n  - rendered-math-validation\ntopics:\n  - slug: tema\n    tasks: [a]\n---\n\nThis complete evidence body is deliberately long enough that topic coverage is the failing invariant.\n`,
      ),
    ]);
    await assert.rejects(
      () => auditVerificationRecords(path.join(root, "tasks"), reviews),
      /review must cover every task in tema/,
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("verified status without a review record is rejected", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "do-indeksa-review-"));
  const tasks = path.join(root, "tasks", "tema");
  const reviews = path.join(root, "reviews");
  await fs.mkdir(tasks, { recursive: true });
  await fs.mkdir(reviews);
  try {
    await writeTask(path.join(tasks, "a.md"), "a", "verified");
    await assert.rejects(
      () => auditVerificationRecords(path.join(root, "tasks"), reviews),
      /verified task has no review record/,
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("a review record requires every verification method", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "do-indeksa-review-"));
  const tasks = path.join(root, "tasks", "tema");
  const reviews = path.join(root, "reviews");
  await fs.mkdir(tasks, { recursive: true });
  await fs.mkdir(reviews);
  try {
    await Promise.all([
      writeTask(path.join(tasks, "a.md"), "a", "verified"),
      fs.writeFile(
        path.join(reviews, "incomplete.md"),
        `---\nid: incomplete\nverifiedAt: '2026-08-11'\nmethods: [source-selector-match]\ntopics:\n  - slug: tema\n    tasks: [a]\n---\n\nThis evidence body is deliberately long enough that the method gate is the failing invariant.\n`,
      ),
    ]);
    await assert.rejects(
      () => auditVerificationRecords(path.join(root, "tasks"), reviews),
      /missing verification method independent-recalculation/,
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

function writeTask(file, id, status) {
  return fs.writeFile(
    file,
    `---\nid: ${id}\ntopic: tema\nstatus: ${status}\n---\n`,
  );
}
