import { analyticsBootstrap } from "../../../lib/analytics-bootstrap";

export const dynamic = "force-dynamic";

const baseHeaders = {
  "cache-control": "no-store",
  "content-type": "application/javascript; charset=utf-8",
  "x-content-type-options": "nosniff",
};

export function GET() {
  return new Response(analyticsBootstrap, {
    status: 200,
    headers: baseHeaders,
  });
}
