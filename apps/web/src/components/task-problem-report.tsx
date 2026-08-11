import { Bug, ExternalLink } from "lucide-react";

export function TaskProblemReport({
  href,
  label,
  accessibleLabel,
}: {
  href: string;
  label: string;
  accessibleLabel: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={accessibleLabel}
      data-testid="task-problem-report"
      className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-600 transition-colors hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
    >
      <Bug aria-hidden="true" className="size-4" strokeWidth={1.75} />
      <span>{label}</span>
      <ExternalLink
        aria-hidden="true"
        className="size-3.5 text-zinc-400"
        strokeWidth={1.75}
      />
    </a>
  );
}
