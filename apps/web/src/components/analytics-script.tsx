import Script from "next/script";
import { parseAnalyticsConfig } from "@/lib/analytics-config";

export function AnalyticsScript() {
  const config = parseAnalyticsConfig({
    scriptUrl: process.env.NEXT_PUBLIC_UMAMI_SCRIPT_URL,
    websiteId: process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID,
    domains: process.env.NEXT_PUBLIC_UMAMI_DOMAINS,
  });
  if (!config) return null;

  return (
    <Script
      id="umami-analytics"
      src={config.scriptUrl}
      strategy="afterInteractive"
      data-website-id={config.websiteId}
      data-domains={config.domains}
      data-do-not-track="true"
      data-exclude-search="true"
      data-exclude-hash="true"
    />
  );
}
