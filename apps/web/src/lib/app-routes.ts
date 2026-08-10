export function isNavigationItemActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function isImmersivePath(pathname: string): boolean {
  const segments = pathname.split("/").filter(Boolean);
  const taskDetail = segments.length === 3 && segments[0] === "tasks";
  const timedRun =
    segments.length === 2 &&
    segments[1] === "new" &&
    (segments[0] === "simulation" || segments[0] === "diagnostic");

  return taskDetail || timedRun;
}
