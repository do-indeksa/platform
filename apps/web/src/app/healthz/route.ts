const headers = {
  "cache-control": "no-store",
  "content-type": "text/plain; charset=utf-8",
};

export function GET() {
  return new Response("ok", { status: 200, headers });
}
