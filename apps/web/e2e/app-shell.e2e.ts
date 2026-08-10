import { expect, test, type Locator } from "@playwright/test";
import { analyticsEvents, installAnalyticsSpy } from "./analytics-spy";

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

test("health check bypasses locale routing", async ({ request }) => {
  const response = await request.get("/healthz", { maxRedirects: 0 });

  expect(response.status()).toBe(200);
  expect(await response.text()).toBe("ok");
  expect(response.headers()["cache-control"]).toContain("no-store");
});

test("analytics bootstrap fails closed without runtime config", async ({
  request,
}) => {
  const response = await request.get("/analytics/bootstrap.js");

  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(response.headers()["content-type"]).toContain(
    "application/javascript",
  );
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
});

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
  await expect(
    page.getByRole("heading", { name: "Tasks", exact: true }),
  ).toBeVisible();
});

test("overview is a primary destination on desktop and mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/ru");
  await expect(
    page.getByTestId("mobile-navigation").getByRole("link", { name: "Обзор" }),
  ).toHaveAttribute("aria-current", "page");

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(
    page.getByTestId("desktop-navigation").getByRole("link", { name: "Обзор" }),
  ).toHaveAttribute("aria-current", "page");
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

test("task-bank filters are shareable and expose an honest empty state", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/ru/tasks");

  await expectMinimumHitArea(page.getByRole("link", { name: "Главная" }));
  await expectMinimumHitArea(
    page
      .getByRole("checkbox", { name: "Выбрать видимые задания" })
      .locator(".."),
  );

  await page.getByRole("button", { name: "Фильтры", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Фильтры" });
  await expect(dialog).toBeVisible();
  await expectMinimumHitArea(
    dialog.getByRole("button", { name: "Закрыть фильтры" }),
  );
  const firstPosition = dialog.getByRole("checkbox", {
    name: "Позиция 1",
    exact: true,
  });
  await expectMinimumHitArea(firstPosition.locator(".."));
  await firstPosition.check();
  await dialog.getByRole("button", { name: "Показать задания" }).click();

  await expect(page).toHaveURL(/position=1/);
  await expect(page.getByText("3 задания", { exact: true })).toBeVisible();

  await page
    .getByRole("searchbox", { name: "Поиск заданий" })
    .fill("нет такого");
  await expect(page).toHaveURL(
    /q=%D0%BD%D0%B5%D1%82\+%D1%82%D0%B0%D0%BA%D0%BE%D0%B3%D0%BE/,
  );
  await expect(
    page.getByRole("heading", { name: "Подходящих заданий нет" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Сбросить фильтры" }).click();
  await expect(page).toHaveURL(/\/ru\/tasks$/);
  await expect(page.getByText("30 заданий", { exact: true })).toBeVisible();
});

test("selected tasks form a bounded practice sequence and return intact", async ({
  page,
}) => {
  await installAnalyticsSpy(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/ru/tasks");
  await page.getByRole("checkbox", { name: "Выбрать задание kb-001" }).check();
  await page.getByRole("checkbox", { name: "Выбрать задание kv-001" }).check();
  await expect(
    page.getByText("Выбрано 2 задания", { exact: true }),
  ).toBeVisible();

  await page.evaluate(() => window.scrollTo({ top: 600 }));
  await page.getByRole("link", { name: "Решать выбранные задания" }).click();

  await expect(page).toHaveURL(/set=kb-001%2Ckv-001/);
  await expect(page.getByText("Задание 1 из 2", { exact: true })).toBeVisible();
  await expect(page.getByTestId("site-header")).toHaveCount(0);

  await page.getByRole("textbox", { name: "t", exact: true }).fill("1");
  await page
    .getByRole("textbox", { name: "|z|", exact: true })
    .fill("3sqrt(2)");
  await page.getByRole("button", { name: "Проверить" }).click();
  await expect(page.getByText("Верно!", { exact: true })).toBeVisible();
  expect(await analyticsEvents(page)).toContainEqual({
    event: "task-solved",
    data: { source: "practice", position: 1, helpLevel: 0 },
  });
  await page.getByRole("link", { name: "Следующее задание" }).click();
  await expect(page).toHaveURL(/\/kvadratna-jednacina\/kv-001\?/);
  await expect(page.getByText("Задание 2 из 2", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Выйти из задания" }).click();
  await expect(page).toHaveURL(/\/ru\/tasks\?selected=kb-001&selected=kv-001$/);
  await expect(
    page.getByText("Выбрано 2 задания", { exact: true }),
  ).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(500);
});

test("legacy topic links enter the unified task bank", async ({ page }) => {
  await page.goto("/en/tasks/logaritmi");

  await expect(page).toHaveURL(/\/en\/tasks\?topic=logaritmi$/);
  await expect(page.getByText("3 tasks", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Logarithms", { exact: true }).first(),
  ).toBeVisible();
});

async function expectMinimumHitArea(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box?.width).toBeGreaterThanOrEqual(44);
  expect(box?.height).toBeGreaterThanOrEqual(44);
}
