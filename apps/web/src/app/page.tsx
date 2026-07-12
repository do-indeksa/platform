import katex from "katex";
import "katex/dist/katex.min.css";

export default function Home() {
  const formula = katex.renderToString(
    "\\int_{3}^{4} f(x)\\,dx = \\frac{11}{2} + \\ln 2",
    { throwOnError: false },
  );
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-4xl font-bold">Do indeksa</h1>
      <p className="text-lg text-zinc-600">
        Besplatna priprema za prijemni ispit. Uskoro.
      </p>
      <div dangerouslySetInnerHTML={{ __html: formula }} />
    </main>
  );
}
