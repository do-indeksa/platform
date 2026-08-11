import { Link } from "@/i18n/navigation";

const toneClasses = {
  lavender: "bg-subtle",
  mint: "bg-[#effbf8]",
  sky: "bg-[#f1f8ff]",
} as const;

const artworkClasses = {
  lavender:
    "left-[257px] top-[78px] h-[144px] w-[166px] -rotate-[8deg] text-[116px] leading-[124px] opacity-35",
  mint: "left-[257px] top-[78px] h-[144px] w-[166px] -rotate-[8deg] text-[116px] leading-[124px] opacity-20",
  sky: "left-[235px] top-[99px] h-[148px] w-[169px] rotate-[10deg] text-[116px] leading-[124px] opacity-20",
} as const;

const artwork = {
  lavender: "X",
  mint: "◌",
  sky: "✦",
} as const;

export function LandingFlowCard({
  href,
  title,
  subtitle,
  status,
  tone,
}: {
  href: string;
  title: string;
  subtitle: string;
  status: string;
  tone: keyof typeof toneClasses;
}) {
  return (
    <Link
      href={href}
      className={`relative h-[220px] w-full shrink-0 overflow-hidden rounded-[18px] border border-line focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand md:h-60 md:w-72 xl:w-[400px] ${toneClasses[tone]}`}
    >
      <h3 className="absolute top-[23px] left-[23px] z-10 w-[290px] max-w-[calc(100%_-_46px)] text-xl leading-7 font-semibold text-ink">
        {title}
      </h3>
      <p className="absolute top-[61px] left-[23px] z-10 w-[260px] max-w-[calc(100%_-_46px)] text-sm leading-5 text-muted">
        {subtitle}
      </p>
      <span
        aria-hidden="true"
        className={`absolute flex items-center justify-center font-extrabold text-brand-ink ${artworkClasses[tone]}`}
      >
        {artwork[tone]}
      </span>
      <span className="absolute top-[183px] left-[23px] z-10 rounded-lg bg-surface px-2.5 py-1.5 text-xs leading-4 font-medium text-brand-ink">
        {status}
      </span>
    </Link>
  );
}
