import type { Metadata } from "next";
import Link from "next/link";
import { getTasks, getTopics } from "@/lib/content";

export const metadata: Metadata = {
  title: "Zadaci — Do indeksa",
  description: "Baza zadataka za prijemni FTN P1, po temama sa rešenjima.",
};

export default async function TopicsPage() {
  const topics = await getTopics();
  const counts = await Promise.all(
    topics.map(async (topic) => (await getTasks(topic.slug)).length),
  );
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="mb-2 text-3xl font-bold">Zadaci</h1>
      <p className="mb-8 text-zinc-600">
        Deset slotova prijemnog P1 — svaki zadatak na ispitu ima svoj tip.
      </p>
      <ol className="space-y-2">
        {topics.map((topic, i) => (
          <li key={topic.slug}>
            <Link
              href={`/zadaci/${topic.slug}`}
              className="flex items-baseline justify-between gap-4 rounded-lg border border-zinc-200 p-4 transition-colors hover:border-zinc-400"
            >
              <span>
                <span className="mr-3 font-mono text-sm text-zinc-400">
                  {topic.slot}.
                </span>
                <span className="font-medium">{topic.name}</span>
              </span>
              <span className="shrink-0 text-sm text-zinc-500">
                {counts[i]} {counts[i] === 1 ? "zadatak" : "zadataka"}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </main>
  );
}
