import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { latexNodesToMarkdown } from "../src/markdown.mjs";
import { loadSourceRegistry } from "../src/sources.mjs";
import { parseWorkbook, selectWorkbookNodes } from "../src/workbook.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const registry = await loadSourceRegistry(
  path.join(repoRoot, "content/sources/ftn-p1/sources.json"),
);
const collection = registry.collections.get("ftn-p1-thematic-sr");

test("the authored workbook has matching task and solution structures", () => {
  const statementCounts = [...collection.statementWorkbook.slots.values()].map(
    (slot) => slot.items.length,
  );
  const solutionCounts = [...collection.solutionWorkbook.slots.values()].map(
    (slot) => slot.items.length,
  );
  assert.deepEqual(statementCounts, [5, 5, 5, 5, 5, 5, 6, 7, 6, 6]);
  assert.deepEqual(solutionCounts, statementCounts);
});

test("a subtask selector extracts only its structural branch", () => {
  const statement = latexNodesToMarkdown(
    selectWorkbookNodes(collection.statementWorkbook, 4, "1a"),
  );
  const solution = latexNodesToMarkdown(
    selectWorkbookNodes(collection.solutionWorkbook, 4, "1a"),
  );
  assert.match(statement, /4\^\{x\}/);
  assert.doesNotMatch(statement, /9\^\{x\}/);
  assert.match(solution, /t=2\^\{x\}/);
  assert.doesNotMatch(solution, /t=3\^\{x\}/);
});

test("a complete item renders nested enumerate labels as Markdown", () => {
  const statement = latexNodesToMarkdown(
    selectWorkbookNodes(collection.statementWorkbook, 1, "1"),
  );
  assert.match(statement, /\*\*a\)\*\*/);
  assert.match(statement, /\*\*b\)\*\*/);
  assert.doesNotMatch(statement, /\\begin\{enumerate\}/);
});

test("a missing source selector is rejected", () => {
  assert.throws(
    () => selectWorkbookNodes(collection.statementWorkbook, 1, "99"),
    /missing slot 1 task 99/,
  );
  assert.throws(
    () => selectWorkbookNodes(collection.solutionWorkbook, 7, "3z"),
    /missing slot 7 task 3z/,
  );
});

test("a slot cannot borrow the next section's task list", () => {
  const source = String.raw`\begin{document}
\section{Slot 1. Prvi}
Bez liste.
\section{Slot 2. Drugi}
\begin{enumerate}
  \item Jedini zadatak.
\end{enumerate}
\end{document}`;
  assert.throws(
    () => parseWorkbook(source, "missing-list.tex"),
    /slot 1 has no task list/,
  );
});
