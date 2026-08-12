import { test as base } from "@playwright/test";

export const test = base.extend<{ guestAuth: void }>({
  guestAuth: [
    async ({ context }, use) => {
      await context.route("**/api/v1/me", (route) =>
        route.fulfill({ status: 401, body: "" }),
      );
      await use();
    },
    { auto: true },
  ],
});

export { expect } from "@playwright/test";
export type { Locator, Page } from "@playwright/test";
