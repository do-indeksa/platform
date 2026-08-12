import { ftnExamCodes, type FtnExamCode } from "./guide-types";

export const TRAINING_BUILDER_PATH = "/training/new";

export function isNavigationItemActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function examCodeFromPathname(pathname: string): FtnExamCode | null {
  const match = pathname.match(/^\/exams\/ftn-(p\d+)\/?$/i);
  if (!match) return null;

  const code = match[1].toUpperCase();
  return ftnExamCodes.find((candidate) => candidate === code) ?? null;
}

export function isImmersivePath(pathname: string): boolean {
  const segments = pathname.split("/").filter(Boolean);
  const timedRun =
    segments.length === 2 &&
    segments[1] === "new" &&
    (segments[0] === "simulation" || segments[0] === "diagnostic");

  return timedRun;
}
