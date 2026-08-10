import { processLatexViaUnified } from "@unified-latex/unified-latex";
import { argumentNodes, listItems } from "./ast.mjs";

const printer = processLatexViaUnified();

export function latexNodesToMarkdown(nodes) {
  return normalize(nodes.map(renderNode).join(""));
}

function renderNode(node) {
  if (node.type === "string") return node.content;
  if (node.type === "parbreak") return "\n\n";
  if (node.type === "whitespace") {
    return node.position?.start.line !== node.position?.end.line ? "\n" : " ";
  }
  if (node.type === "inlinemath") {
    return `$${printNodes(node.content).trim()}$`;
  }
  if (node.type === "displaymath") {
    return `\n\n$$\n${printNodes(node.content).trim()}\n$$\n\n`;
  }
  if (node.type === "group") return node.content.map(renderNode).join("");
  if (node.type === "environment") return renderEnvironment(node);
  if (node.type === "macro") return renderMacro(node);
  if (node.type === "comment") return "";
  return printNodes([node]);
}

function renderMacro(node) {
  const content = argumentNodes(node).map(renderNode).join("").trim();
  if (node.content === "textbf") return `**${content}**`;
  if (node.content === "textit" || node.content === "emph") {
    return `*${content}*`;
  }
  if (node.content === "par") return "\n\n";
  if (node.content === "noindent") return "";
  if (node.content === "\\") return "\n";
  return printNodes([node]);
}

function renderEnvironment(node) {
  if (node.env !== "enumerate" && node.env !== "itemize") {
    return printNodes([node]);
  }
  return listItems(node)
    .map((nodes, index) => {
      const label =
        node.env === "itemize"
          ? "-"
          : `**${String.fromCharCode("a".charCodeAt(0) + index)})**`;
      return `${label} ${latexNodesToMarkdown(nodes)}`;
    })
    .join("\n\n");
}

function printNodes(nodes) {
  return printer.stringify({ type: "root", content: nodes });
}

function normalize(value) {
  return value
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
