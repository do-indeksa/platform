export function LandingStep({
  number,
  title,
  body,
  final = false,
}: {
  number: number;
  title: string;
  body: string;
  final?: boolean;
}) {
  return (
    <article className="flex h-[152px] min-w-0 flex-col items-start gap-3.5">
      <div className="flex h-9 w-[296px] shrink-0 items-center gap-3 overflow-hidden">
        <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-subtle text-sm leading-5 font-semibold text-brand-ink">
          {number}
        </span>
        <span
          aria-hidden="true"
          className={`h-px min-w-0 flex-1 bg-line ${final ? "opacity-0" : ""}`}
        />
      </div>
      <div
        data-fit-container
        className="flex h-[76px] w-[296px] flex-col items-start gap-2 overflow-hidden"
      >
        <h3 className="w-full text-[15px] leading-[22px] font-semibold text-ink">
          {title}
        </h3>
        <p className="w-full text-[13px] leading-5 text-muted">{body}</p>
      </div>
    </article>
  );
}
