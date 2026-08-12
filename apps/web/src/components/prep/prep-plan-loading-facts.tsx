export function PrepPlanLoadingFacts() {
  return (
    <section
      data-testid="prep-loading-facts"
      aria-hidden="true"
      className="grid min-h-[210px] grid-cols-1 gap-2.5 overflow-hidden rounded-[14px] border border-line bg-surface px-[18px] py-3.5 lg:min-h-[86px] lg:grid-cols-3 lg:gap-[22px]"
    >
      {Array.from({ length: 3 }, (_, index) => (
        <span
          key={index}
          className="flex min-h-[52px] min-w-0 items-center gap-3 lg:px-1"
        >
          <span className="h-[22px] w-[22px] shrink-0 animate-pulse rounded-md bg-brand/15" />
          <span className="min-w-0 flex-1 animate-pulse">
            <span className="block h-3 w-20 rounded bg-brand/10" />
            <span className="mt-2 block h-4 w-40 max-w-full rounded bg-brand/15" />
          </span>
        </span>
      ))}
    </section>
  );
}
