import type { Metadata } from "next";
import Link from "next/link";
import { SimulationHistory } from "@/components/simulation-history";

export const metadata: Metadata = {
  title: "Simulacija prijemnog — Do indeksa",
  description:
    "Probni prijemni u realnom formatu P1: 10 zadataka, 180 minuta, 60 bodova.",
};

export default function SimulationPage() {
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="mb-2 text-3xl font-bold">Simulacija prijemnog</h1>
      <p className="mb-1 text-zinc-600">
        Realan format P1: 10 zadataka (po jedan iz svakog slota), 180 minuta,
        svaki zadatak nosi 6 bodova — ukupno 60.
      </p>
      <p className="mb-8 text-zinc-600">
        Rešavaj na papiru. Kad predaš, uporedi svoj rad sa rešenjima i sam oceni
        svaki zadatak — kao na pravom ispitu, samo si ti komisija.
      </p>
      <Link
        href="/simulacija/nova"
        className="inline-block rounded-full bg-zinc-900 px-6 py-3 font-medium text-white transition-colors hover:bg-zinc-700"
      >
        Počni novu simulaciju →
      </Link>
      <SimulationHistory />
    </main>
  );
}
