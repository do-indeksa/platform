import type { PrepPositionStatus } from "@/lib/prep-plan";

export const PROGRESS_STATUS_STYLES: Record<
  PrepPositionStatus,
  { badge: string; bar: string; number: string }
> = {
  untested: {
    badge: "bg-zinc-100 text-zinc-600",
    bar: "bg-zinc-300",
    number: "bg-zinc-100 text-zinc-600",
  },
  starting: {
    badge: "bg-amber-50 text-amber-800",
    bar: "bg-amber-400",
    number: "bg-amber-50 text-amber-800",
  },
  needsWork: {
    badge: "bg-red-50 text-red-700",
    bar: "bg-red-500",
    number: "bg-red-50 text-red-700",
  },
  progressing: {
    badge: "bg-cyan-50 text-cyan-800",
    bar: "bg-cyan-500",
    number: "bg-cyan-50 text-cyan-800",
  },
  confident: {
    badge: "bg-emerald-50 text-emerald-700",
    bar: "bg-emerald-500",
    number: "bg-emerald-50 text-emerald-700",
  },
};
