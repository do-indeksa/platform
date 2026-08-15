import { expect, test } from "@playwright/test";

const rewrites = [
  { publicPath: "/graphql", backendPath: "/graphql" },
  { publicPath: "/api/v1/attempts", backendPath: "/v1/attempts" },
];

test("API rewrites preserve the external origin without locale routing", async ({
  request,
}) => {
  for (const { publicPath, backendPath } of rewrites) {
    const response = await request.post(publicPath, {
      data: publicPath === "/graphql" ? { query: "{ __typename }" } : [],
      maxRedirects: 0,
    });

    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({
      method: "POST",
      path: backendPath,
      origin: "http://127.0.0.1:33100",
      forwardedOrigin: "http://127.0.0.1:33100",
    });
  }
});
