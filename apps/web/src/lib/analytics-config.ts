export type AnalyticsConfig = {
  scriptUrl: string;
  websiteId: string;
  domains: string;
};

export type AnalyticsConfigInput = {
  scriptUrl?: string;
  websiteId?: string;
  domains?: string;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HOST_LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function parseAnalyticsConfig(
  input: AnalyticsConfigInput,
): AnalyticsConfig | null {
  const scriptUrl = input.scriptUrl?.trim();
  const websiteId = input.websiteId?.trim();
  if (!scriptUrl || !websiteId) return null;
  if (!isAllowedScriptUrl(scriptUrl) || !UUID_PATTERN.test(websiteId)) {
    return null;
  }

  const domains = parseDomains(input.domains);
  if (domains === null) return null;
  return {
    scriptUrl,
    websiteId: websiteId.toLowerCase(),
    domains,
  };
}

function isAllowedScriptUrl(value: string): boolean {
  if (value.startsWith("/") && !value.startsWith("//")) {
    return !value.includes("\\") && !/\s/.test(value);
  }
  try {
    const url = new URL(value);
    if (url.username || url.password || url.hash) return false;
    if (url.protocol === "https:") return true;
    return url.protocol === "http:" && isLoopback(url.hostname);
  } catch {
    return false;
  }
}

function parseDomains(value?: string): string | null {
  if (!value?.trim()) return null;
  const domains = value
    .split(",")
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean);
  if (domains.length === 0 || domains.some((domain) => !isHostname(domain))) {
    return null;
  }
  return [...new Set(domains)].join(",");
}

function isHostname(value: string): boolean {
  if (isLoopback(value)) return true;
  if (value.length > 253 || value.endsWith(".")) return false;
  if (isIpv4(value)) return true;
  const labels = value.split(".");
  return (
    labels.length > 1 && labels.every((label) => HOST_LABEL_PATTERN.test(label))
  );
}

function isLoopback(value: string): boolean {
  return value === "localhost" || value === "127.0.0.1" || value === "[::1]";
}

function isIpv4(value: string): boolean {
  const parts = value.split(".");
  return (
    parts.length === 4 &&
    parts.every(
      (part) =>
        /^\d{1,3}$/.test(part) && Number(part) >= 0 && Number(part) <= 255,
    )
  );
}
