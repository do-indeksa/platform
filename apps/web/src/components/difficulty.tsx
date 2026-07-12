export function Difficulty({ level }: { level: number }) {
  return (
    <span
      className="text-sm text-amber-500"
      aria-label={`Težina ${level} od 5`}
    >
      {"★".repeat(level)}
      <span className="text-zinc-300">{"★".repeat(5 - level)}</span>
    </span>
  );
}
