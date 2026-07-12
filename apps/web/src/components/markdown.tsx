import { renderMarkdown } from "@/lib/markdown";

export async function Markdown({ children }: { children: string }) {
  const html = await renderMarkdown(children);
  return (
    <div
      className="space-y-3 leading-relaxed [&_.katex-display]:overflow-x-auto"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
