export function Difficulty({ level }: { level: number }) {
  return (
    <span
      role="img"
      aria-label={`Težina ${level} od 5`}
      className="text-sm text-amber-500"
    >
      <span aria-hidden="true">{"★".repeat(level)}</span>
      <span aria-hidden="true" className="text-zinc-300">
        {"★".repeat(5 - level)}
      </span>
    </span>
  );
}
