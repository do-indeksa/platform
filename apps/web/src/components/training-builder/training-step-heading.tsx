export function TrainingStepHeading({
  id,
  step,
  children,
}: {
  id: string;
  step: number;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-xl bg-brand text-xs leading-4 font-medium tracking-[0.2px] text-on-brand tabular-nums">
        {step}
      </span>
      <h2 id={id} className="text-sm leading-5 font-semibold text-ink">
        {children}
      </h2>
    </div>
  );
}
