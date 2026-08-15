export function PrepPlanLoadingSummary() {
  return (
    <section
      data-testid="prep-loading-summary"
      aria-hidden="true"
      className="grid h-[252px] grid-cols-2 content-start gap-x-2.5 gap-y-3 overflow-hidden rounded-[14px] border border-line bg-surface px-[17px] py-[15px] lg:h-[116px] lg:grid-cols-[minmax(240px,1.4fr)_minmax(150px,1fr)_minmax(150px,1fr)_190px] lg:content-center lg:items-center lg:gap-[18px] xl:grid-cols-[330px_220px_220px_minmax(0,1fr)_190px]"
    >
      <div className="col-span-2 flex h-[72px] min-w-0 items-center gap-3.5 lg:col-span-1 lg:h-20 lg:gap-4">
        <span className="h-16 w-16 shrink-0 animate-pulse rounded-full border-[7px] border-brand/15 lg:h-[68px] lg:w-[68px]" />
        <span className="min-w-0 flex-1 animate-pulse">
          <span className="block h-4 w-28 rounded bg-brand/10" />
          <span className="mt-2 block h-5 w-36 rounded bg-brand/15" />
          <span className="mt-2 hidden h-[5px] w-[180px] rounded-[3px] bg-line lg:block" />
        </span>
      </div>

      <LoadingMetric />
      <LoadingMetric />
      <span aria-hidden className="hidden min-w-0 xl:block" />
      <span className="col-span-2 h-11 w-full animate-pulse rounded-[10px] border border-line bg-page lg:col-span-1 lg:w-[190px]" />
    </section>
  );
}

function LoadingMetric() {
  return (
    <span className="flex h-[76px] min-w-0 items-center gap-2 lg:h-[72px] lg:gap-3">
      <span className="h-9 w-9 shrink-0 animate-pulse rounded-xl bg-subtle lg:h-[42px] lg:w-[42px]" />
      <span className="min-w-0 flex-1 animate-pulse">
        <span className="block h-4 w-20 rounded bg-brand/10" />
        <span className="mt-1 block h-5 w-24 rounded bg-brand/15" />
        <span className="mt-1 block h-3 w-28 max-w-full rounded bg-brand/10" />
      </span>
    </span>
  );
}
