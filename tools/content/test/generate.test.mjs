import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import { generateTaskFiles, writeTaskFiles } from "../src/generate.mjs";
import { loadSourceRegistry } from "../src/sources.mjs";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const repoRoot = path.resolve(packageRoot, "../..");
const registry = await loadSourceRegistry(
  path.join(repoRoot, "content/sources/ftn-p1/sources.json"),
);
const example = JSON.parse(
  await fs.readFile(path.join(packageRoot, "examples/one-task.json"), "utf8"),
);

test("a reviewer manifest generates a schema-compatible draft", () => {
  const files = generateTaskFiles(example, registry);
  assert.equal(files.size, 1);
  const content = files.get("kompleksni-brojevi/kb-import-example.md");
  const parsed = matter(content);
  assert.deepEqual(
    {
      id: parsed.data.id,
      slot: parsed.data.slot,
      status: parsed.data.status,
      origin: parsed.data.origin,
      checks: parsed.data.check.length,
    },
    {
      id: "kb-import-example",
      slot: 1,
      status: "draft",
      origin: "FTN_P1_Tematski_Zadaci_sr.tex, slot 1, zadatak 5",
      checks: 2,
    },
  );
  assert.match(parsed.content, /^## Zadatak$/m);
  assert.match(parsed.content, /^## Nagoveštaj 1$/m);
  assert.match(parsed.content, /^## Nagoveštaj 2$/m);
  assert.match(parsed.content, /^## Rešenje$/m);
  assert.doesNotMatch(parsed.content, /\\begin\{enumerate\}/);
});

test("the import schema cannot mint verified content", () => {
  assert.throws(
    () =>
      generateTaskFiles(
        { ...example, defaults: { ...example.defaults, status: "verified" } },
        registry,
      ),
    /invalid status/,
  );
});

test("task selectors start at one", () => {
  assert.throws(
    () =>
      generateTaskFiles(
        {
          ...example,
          tasks: [{ ...example.tasks[0], selector: "0" }],
        },
        registry,
      ),
    /invalid selector/,
  );
});

test("generation is atomic and refuses to overwrite output", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "do-indeksa-content-"),
  );
  const output = path.join(directory, "generated");
  const files = generateTaskFiles(example, registry);
  try {
    await writeTaskFiles(files, output);
    const generated = await fs.readFile(
      path.join(output, "kompleksni-brojevi/kb-import-example.md"),
      "utf8",
    );
    assert.match(generated, /status: draft/);
    await assert.rejects(() => writeTaskFiles(files, output), /already exists/);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
