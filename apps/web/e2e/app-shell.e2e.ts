import { expect, test } from "@playwright/test";

const locales = [
  { path: "/tasks", heading: "Zadaci", htmlLang: "sr-Latn" },
  { path: "/en/tasks", heading: "Tasks", htmlLang: "en" },
  { path: "/ru/tasks", heading: "Задания", htmlLang: "ru" },
] as const;

const viewports = [
  { name: "mobile", width: 360, height: 800 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
] as const;

for (const locale of locales) {
  for (const viewport of viewports) {
    test(`${locale.htmlLang} shell fits ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto(locale.path);

      await expect(page.locator("html")).toHaveAttribute(
        "lang",
        locale.htmlLang,
      );
      await expect(
        page.getByRole("heading", { name: locale.heading, exact: true }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);

      if (viewport.name === "mobile") {
        await expect(page.getByTestId("mobile-navigation")).toBeVisible();
        await expect(page.getByTestId("desktop-navigation")).toBeHidden();
      } else {
        await expect(page.getByTestId("desktop-navigation")).toBeVisible();
        await expect(page.getByTestId("mobile-navigation")).toBeHidden();
      }
    });
  }
}

test("language switch keeps the current route", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/tasks?source=official");
  await page.getByRole("link", { name: "EN", exact: true }).click();

  await expect(page).toHaveURL(/\/en\/tasks\?source=official$/);
  await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible();
});

test("secondary desktop navigation exposes active state and closes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/calculator");

  const more = page.getByTitle("Još");
  const menu = more.locator("..");
  await expect(more).toHaveClass(/bg-subtle/);
  await more.click();
  await expect(page.getByRole("link", { name: "Kalkulator" })).toHaveAttribute(
    "aria-current",
    "page",
  );

  await page.goto("/tasks");
  await more.click();
  await page.getByRole("link", { name: "Kalkulator" }).click();

  await expect(page).toHaveURL(/\/calculator$/);
  await expect(menu).not.toHaveAttribute("open", "");
});

test("authentication redirect keeps the visible locale", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/ru/tasks");

  await expect(page.getByRole("link", { name: "Войти" })).toHaveAttribute(
    "href",
    /redirect=%2Fru%2Ftasks/,
  );
});

test("focused work hides the global shell", async ({ page }) => {
  await page.goto("/en/simulation/new");
  await expect(page.getByTestId("site-header")).toHaveCount(0);
  await expect(page.getByTestId("mobile-navigation")).toHaveCount(0);
});
