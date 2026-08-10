import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { auditTaskOrigins } from "../src/audit.mjs";
import { loadSourceRegistry } from "../src/sources.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const registry = await loadSourceRegistry(
  path.join(repoRoot, "content/sources/ftn-p1/sources.json"),
);

test("every published task points to a real authored task and solution", async () => {
  assert.deepEqual(
    await auditTaskOrigins(path.join(repoRoot, "content/tasks"), registry),
    { taskCount: 30, slotCount: 10, originCount: 30 },
  );
});
