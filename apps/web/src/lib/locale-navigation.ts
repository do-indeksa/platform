import { routing, type AppLocale } from "../i18n/routing";

const navigationOrigin = "https://locale-navigation.invalid";
const encodedPathSeparator = /%(?:2f|5c)/i;

export function buildLocalePathname(
  pathname: string,
  nextLocale: AppLocale,
): string {
  const safePathname = internalPathname(pathname);
  if (nextLocale === routing.defaultLocale) return safePathname;
  return safePathname === "/"
    ? `/${nextLocale}`
    : `/${nextLocale}${safePathname}`;
}

export function buildLocaleHref(
  pathname: string,
  nextLocale: AppLocale,
  query: string,
  hash: string,
): string {
  const destination = new URL(
    buildLocalePathname(pathname, nextLocale),
    navigationOrigin,
  );
  destination.search = query;
  destination.hash = hash;
  return `${destination.pathname}${destination.search}${destination.hash}`;
}

function internalPathname(pathname: string): string {
  if (
    !pathname.startsWith("/") ||
    pathname.startsWith("//") ||
    pathname.includes("\\") ||
    encodedPathSeparator.test(pathname)
  ) {
    return "/";
  }

  try {
    const destination = new URL(pathname, navigationOrigin);
    if (
      destination.origin !== navigationOrigin ||
      destination.pathname.startsWith("//") ||
      destination.search ||
      destination.hash
    ) {
      return "/";
    }
    return destination.pathname;
  } catch {
    return "/";
  }
}
