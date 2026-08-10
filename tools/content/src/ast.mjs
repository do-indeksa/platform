export function argumentNodes(macro) {
  const argument = macro.args?.findLast(
    (candidate) => candidate.content.length,
  );
  return argument?.content ?? [];
}

export function listItems(environment) {
  if (environment?.type !== "environment") return [];
  return environment.content
    .filter((node) => node.type === "macro" && node.content === "item")
    .map((node) => argumentNodes(node));
}

export function nodesText(nodes) {
  return nodes.map(nodeText).join("").replace(/\s+/g, " ").trim();
}

function nodeText(node) {
  if (node.type === "string") return node.content;
  if (node.type === "whitespace" || node.type === "parbreak") return " ";
  if (Array.isArray(node.content)) return nodesText(node.content);
  if (node.type === "macro") return nodesText(argumentNodes(node));
  return "";
}
