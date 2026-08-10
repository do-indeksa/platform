import { processLatexToAstViaUnified } from "@unified-latex/unified-latex";
import { argumentNodes, listItems, nodesText } from "./ast.mjs";

const parser = processLatexToAstViaUnified();
const selectorPattern = /^([1-9]\d*)([a-z])?$/;

export function parseWorkbook(source, sourceName) {
  const root = parser.parse(source);
  const document = root.content.find(
    (node) => node.type === "environment" && node.env === "document",
  );
  const content = document?.content ?? root.content;
  const slots = new Map();

  for (let index = 0; index < content.length; index += 1) {
    const node = content[index];
    if (node.type !== "macro" || node.content !== "section") continue;
    const title = nodesText(argumentNodes(node));
    const match = title.match(/^Slot\s+(\d+)\.\s*(.+?)(?:\s+—\s+rešenja)?$/);
    if (!match) continue;
    const slot = Number(match[1]);
    const environment = findSlotTaskList(content, index + 1);
    if (!environment) {
      throw new Error(`${sourceName}: slot ${slot} has no task list`);
    }
    if (slots.has(slot)) {
      throw new Error(`${sourceName}: duplicate slot ${slot}`);
    }
    const items = listItems(environment).map((nodes, itemIndex) => ({
      number: itemIndex + 1,
      nodes,
    }));
    if (!items.length) throw new Error(`${sourceName}: slot ${slot} is empty`);
    slots.set(slot, { slot, title: match[2], items });
  }

  if (!slots.size) throw new Error(`${sourceName}: no slots found`);
  return { sourceName, slots };
}

function findSlotTaskList(content, startIndex) {
  for (let index = startIndex; index < content.length; index += 1) {
    const candidate = content[index];
    if (candidate.type === "macro" && candidate.content === "section") {
      return null;
    }
    if (candidate.type === "environment" && candidate.env === "enumerate") {
      return candidate;
    }
  }
  return null;
}

export function selectWorkbookNodes(workbook, slotNumber, selector) {
  const match = selector.match(selectorPattern);
  if (!match) throw new Error(`invalid task selector ${selector}`);
  const slot = workbook.slots.get(slotNumber);
  if (!slot)
    throw new Error(`${workbook.sourceName}: missing slot ${slotNumber}`);
  const item = slot.items[Number(match[1]) - 1];
  if (!item) {
    throw new Error(
      `${workbook.sourceName}: missing slot ${slotNumber} task ${match[1]}`,
    );
  }
  if (!match[2]) return stripAnswerSummary(item.nodes);

  const partIndex = match[2].charCodeAt(0) - "a".charCodeAt(0);
  const parts = nestedParts(item.nodes) ?? markedParts(item.nodes);
  const part = parts?.items[partIndex];
  if (!part) {
    throw new Error(
      `${workbook.sourceName}: missing slot ${slotNumber} task ${selector}`,
    );
  }
  return stripAnswerSummary([...parts.prefix, ...part]);
}

function nestedParts(nodes) {
  const index = nodes.findIndex(
    (node) => node.type === "environment" && node.env === "enumerate",
  );
  if (index < 0) return null;
  return { prefix: nodes.slice(0, index), items: listItems(nodes[index]) };
}

function markedParts(nodes) {
  const markers = [];
  nodes.forEach((node, index) => {
    if (
      node.type === "macro" &&
      new Set(["textbf", "textit", "emph"]).has(node.content) &&
      /^[a-z]\)$/i.test(nodesText(argumentNodes(node)))
    ) {
      markers.push({ index, end: index + 1 });
      return;
    }
    const previous = nodes
      .slice(0, index)
      .findLast((candidate) => candidate.type !== "whitespace");
    if (
      node.type === "string" &&
      /^[a-zčćđšž]$/i.test(node.content) &&
      nodes[index + 1]?.type === "string" &&
      nodes[index + 1].content === ")" &&
      (!previous || previous.type === "parbreak")
    ) {
      markers.push({ index, end: index + 2 });
    }
  });
  if (!markers.length) return null;

  const prefix = nodes.slice(0, markers[0].index);
  const items = [];
  for (let index = 0; index < markers.length; index += 1) {
    const marker = markers[index];
    const end = markers[index + 1]?.index ?? nodes.length;
    items.push(nodes.slice(marker.end, end));
  }
  return { prefix, items };
}

function stripAnswerSummary(nodes) {
  const summaryIndex = nodes.findIndex(
    (node) =>
      node.type === "macro" &&
      new Set(["textbf", "textit", "emph"]).has(node.content) &&
      /^Rešenje[.:]?$/i.test(nodesText(argumentNodes(node))),
  );
  return summaryIndex < 0 ? nodes : nodes.slice(0, summaryIndex);
}
