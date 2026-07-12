"use client";

export function MarkButton({
  active,
  onClick,
  className,
  children,
}: {
  active: boolean;
  onClick: () => void;
  className: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${className} ${
        active ? "ring-2 ring-current" : "opacity-60 hover:opacity-100"
      }`}
    >
      {children}
    </button>
  );
}
