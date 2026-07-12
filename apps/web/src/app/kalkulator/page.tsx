import type { Metadata } from "next";
import { ScoreCalculator } from "@/components/score-calculator";
import { getFtnCutoffs } from "@/lib/guide";

export const metadata: Metadata = {
  title: "Kalkulator bodova za FTN",
  description:
    "Izračunaj ukupan broj bodova za upis na FTN i uporedi sa prohodnim bodovima svih studijskih programa.",
};

export default async function CalculatorPage() {
  const { source, programs } = await getFtnCutoffs();
  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="mb-2 text-3xl font-bold">Kalkulator bodova — FTN</h1>
      <p className="mb-1 text-zinc-600">
        Ukupno = uspeh iz srednje škole (zbir proseka sva četiri razreda × 2,
        najviše 40) + prijemni ispit (najviše 60).
      </p>
      <p className="mb-8 text-zinc-600">
        Zakonski minimum: budžet od 50,01 · samofinansiranje od 30,01.
      </p>
      <ScoreCalculator programs={programs} />
      <p className="mt-8 text-sm text-zinc-500">
        Prohodni bodovi su „poslednji upisani“ iz zvanične{" "}
        <a href={source} className="underline hover:text-zinc-700">
          statistike upisa FTN
        </a>
        . Menjaju se iz godine u godinu — posle reforme prijemnog 2024. kao
        orijentir koristi samo 2024. i 2025.
      </p>
    </main>
  );
}
