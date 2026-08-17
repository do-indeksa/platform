import { parseAnalyticsConfig } from "../../../lib/analytics-config";

export const dynamic = "force-dynamic";

const baseHeaders = {
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
  "x-content-type-options": "nosniff",
};

export function GET() {
  const config = parseAnalyticsConfig({
    scriptUrl: process.env.UMAMI_SCRIPT_URL,
    websiteId: process.env.UMAMI_WEBSITE_ID,
    domains: process.env.UMAMI_DOMAINS,
  });
  if (!config) {
    return new Response(null, { status: 204, headers: baseHeaders });
  }

  return Response.json(config, { status: 200, headers: baseHeaders });
}
