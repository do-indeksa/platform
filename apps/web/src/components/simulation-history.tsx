"use client";

import { useSimulation } from "@/lib/simulation-store";
import { useHydrated } from "@/lib/use-hydrated";

export function SimulationHistory() {
  const history = useSimulation((state) => state.history);
  const hydrated = useHydrated();

  if (!hydrated || history.length === 0) return null;

  return (
    <section className="mt-10">
      <h2 className="mb-3 text-xl font-bold">Tvoji pokušaji</h2>
      <ul className="space-y-1">
        {history.map((entry) => (
          <li
            key={entry.finishedAt}
            className="flex justify-between border-b border-zinc-100 py-2 text-sm"
          >
            <span>
              {new Date(entry.finishedAt).toLocaleDateString("sr-Latn-RS", {
                day: "numeric",
                month: "long",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            <span className="font-mono font-medium">{entry.score} / 60</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
