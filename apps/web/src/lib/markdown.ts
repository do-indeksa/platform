import rehypeKatex from "rehype-katex";
import rehypeStringify from "rehype-stringify";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";

const processor = unified()
  .use(remarkParse)
  .use(remarkMath)
  .use(remarkRehype)
  .use(rehypeKatex)
  .use(rehypeStringify);

const parser = unified().use(remarkParse).use(remarkMath);

export async function renderMarkdown(markdown: string): Promise<string> {
  const file = await processor.process(markdown);
  return String(file);
}

type MarkdownNode = {
  type: string;
  value?: unknown;
  alt?: unknown;
  children?: MarkdownNode[];
};

const BLOCK_NODES = new Set([
  "blockquote",
  "code",
  "heading",
  "list",
  "listItem",
  "math",
  "paragraph",
  "thematicBreak",
]);

export function markdownToPlainText(markdown: string): string {
  const parts: string[] = [];

  const collect = (node: MarkdownNode) => {
    if (
      ["text", "inlineCode", "code", "inlineMath", "math"].includes(
        node.type,
      ) &&
      typeof node.value === "string"
    ) {
      parts.push(node.value);
    } else if (node.type === "image" && typeof node.alt === "string") {
      parts.push(node.alt);
    }

    for (const child of node.children ?? []) collect(child);
    if (BLOCK_NODES.has(node.type)) parts.push(" ");
  };

  collect(parser.parse(markdown) as MarkdownNode);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}
