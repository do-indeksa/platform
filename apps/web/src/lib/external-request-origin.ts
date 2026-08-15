function firstForwardedValue(value: string | null): string | null {
  const first = value?.split(",", 1)[0]?.trim();
  return first || null;
}

export function externalRequestOrigin(headers: Headers, fallback: URL): string {
  const host =
    firstForwardedValue(headers.get("x-forwarded-host")) ??
    headers.get("host") ??
    fallback.host;
  const protocol =
    firstForwardedValue(headers.get("x-forwarded-proto")) ??
    fallback.protocol.replace(/:$/, "");

  try {
    const origin = new URL(`${protocol}://${host}`).origin;
    return origin === "null" ? fallback.origin : origin;
  } catch {
    return fallback.origin;
  }
}
