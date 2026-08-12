import type { Page } from "@playwright/test";

export async function installCabinetAuthGate(page: Page): Promise<() => void> {
  let releaseRequest: (() => void) | undefined;
  const requestGate = new Promise<void>((resolve) => {
    releaseRequest = resolve;
  });

  await page.route("**/api/v1/me", async (route) => {
    await requestGate;
    await route.fulfill({ status: 401, body: "" });
  });

  return () => releaseRequest?.();
}
