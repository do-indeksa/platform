"use client";

import type { ReactNode } from "react";

const TONES = {
  red: "border-red-200 bg-red-50",
  amber: "border-amber-200 bg-amber-50",
  violet: "border-violet-200 bg-violet-50",
  green: "border-green-200 bg-green-50",
} as const;

export function FeedbackCard({
  tone,
  title,
  children,
}: {
  tone: keyof typeof TONES;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className={`space-y-4 rounded-lg border p-5 ${TONES[tone]}`}>
      <p className="font-bold">{title}</p>
      {children}
    </div>
  );
}

export function CardButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-zinc-400 bg-white px-4 py-2 text-sm font-medium transition-colors hover:border-zinc-600"
    >
      {children}
    </button>
  );
}
