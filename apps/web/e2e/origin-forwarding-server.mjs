import { createServer } from "node:http";

const port = Number(process.env.PORT ?? 38080);

createServer((request, response) => {
  if (request.url === "/healthz") {
    response.writeHead(200).end("ok");
    return;
  }
  response.writeHead(200, { "Content-Type": "application/json" });
  response.end(
    JSON.stringify({
      method: request.method,
      path: request.url,
      origin: request.headers.origin ?? null,
      forwardedOrigin: request.headers["x-di-forwarded-origin"] ?? null,
    }),
  );
}).listen(port, "127.0.0.1");
