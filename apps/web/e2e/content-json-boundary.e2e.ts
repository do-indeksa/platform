import { expect, test } from "@playwright/test";

const routes = [
  ["diagnostic checker", "/api/content/diagnostic-check"],
  ["simulation grader", "/api/content/simulation-grade"],
] as const;
const rejectedMediaTypes = [
  "application/jsonp",
  "application/json-patch+json",
  "text/application/json",
  'application/json; charset="unterminated',
] as const;
const acceptedMediaTypes = [
  "application/json",
  "Application/JSON",
  "application/json; charset=utf-8",
  'application/json; charset="utf-8"',
] as const;

for (const [name, path] of routes) {
  test.describe(`${name} JSON boundary`, () => {
    test("rejects ambiguous or malformed media types", async ({ request }) => {
      for (const contentType of rejectedMediaTypes) {
        const response = await request.post(path, {
          headers: { "Content-Type": contentType },
          data: "{}",
        });

        expect(response.status(), contentType).toBe(415);
        expect(response.headers()["cache-control"], contentType).toBe(
          "private, no-store",
        );
      }
    });

    test("accepts JSON media types before validating the body", async ({
      request,
    }) => {
      for (const contentType of acceptedMediaTypes) {
        const response = await request.post(path, {
          headers: { "Content-Type": contentType },
          data: "{}",
        });

        expect(response.status(), contentType).toBe(400);
      }
    });
  });
}
