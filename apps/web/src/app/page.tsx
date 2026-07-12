import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-4xl font-bold">Do indeksa</h1>
      <p className="max-w-md text-lg text-zinc-600">
        Besplatna platforma za izbor fakulteta i pripremu prijemnog ispita.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <Link
          href="/zadaci"
          className="rounded-full bg-zinc-900 px-6 py-3 font-medium text-white transition-colors hover:bg-zinc-700"
        >
          Zadaci za vežbanje →
        </Link>
        <Link
          href="/simulacija"
          className="rounded-full border border-zinc-300 px-6 py-3 font-medium transition-colors hover:border-zinc-500"
        >
          Simulacija prijemnog
        </Link>
        <Link
          href="/kalkulator"
          className="rounded-full border border-zinc-300 px-6 py-3 font-medium transition-colors hover:border-zinc-500"
        >
          Kalkulator bodova
        </Link>
      </div>
    </main>
  );
}
