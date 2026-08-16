import { expect, type Locator } from "@playwright/test";

export async function expectCenterToReceivePointer(locator: Locator) {
  await expect(locator).toBeVisible();

  const hitTest = await locator.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const target = document.elementFromPoint(
      box.left + box.width / 2,
      box.top + box.height / 2,
    );

    return {
      receivesPointer:
        target !== null && (target === element || element.contains(target)),
      target: target?.tagName.toLowerCase() ?? null,
    };
  });

  expect(
    hitTest.receivesPointer,
    `expected center point to hit the navigation target, got ${hitTest.target ?? "nothing"}`,
  ).toBe(true);
}
