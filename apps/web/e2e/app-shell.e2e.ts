import { expect, test, type Locator, type Page } from "./test";
import { analyticsEvents, installAnalyticsSpy } from "./analytics-spy";

const desktopDestinations = [
  { label: "My preparation", path: "/en/cabinet" },
  { label: "Tasks", path: "/en/tasks" },
  { label: "Training", path: "/en/training/new" },
  { label: "Study plan", path: "/en/prep" },
  { label: "History", path: "/en/history" },
  { label: "Faculties", path: "/en/faculties/ftn" },
  { label: "Exams", path: "/en/exams" },
] as const;

const tabletOverflowDestinations = [
  { label: "Study plan", path: "/en/prep" },
  { label: "History", path: "/en/history" },
  { label: "Faculties", path: "/en/faculties/ftn" },
  { label: "Entrance exams", path: "/en/exams" },
  { label: "Calculator", path: "/en/calculator" },
] as const;

const mobileDestinations = [
  { label: "Overview", path: "/en/cabinet" },
  { label: "Tasks", path: "/en/tasks" },
  { label: "Training", path: "/en/training/new" },
  { label: "Study plan", path: "/en/prep" },
  { label: "Mock exam", path: "/en/simulation" },
  { label: "History", path: "/en/history" },
  { label: "Entrance exams", path: "/en/exams" },
  { label: "Faculties", path: "/en/faculties/ftn" },
  { label: "Calculator", path: "/en/calculator" },
] as const;

const locales = [
  {
    path: "/tasks",
    heading: "Zadaci",
    htmlLang: "sr-Latn",
    headerItems: ["Moja priprema", "Zadaci", "Vežbanje"],
  },
  {
    path: "/en/tasks",
    heading: "Tasks",
    htmlLang: "en",
    headerItems: ["My preparation", "Tasks", "Training"],
  },
  {
    path: "/ru/tasks",
    heading: "Задания",
    htmlLang: "ru",
    headerItems: ["Моя подготовка", "Задания", "Тренировки"],
  },
] as const;

const viewports = [
  { name: "mobile-360", width: 360, height: 800 },
  { name: "mobile-390", width: 390, height: 844 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "tablet-1024", width: 1024, height: 880 },
  { name: "desktop-1280", width: 1280, height: 900 },
  { name: "desktop-1440", width: 1440, height: 900 },
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

      if (viewport.width < 768) {
        await expect(page.getByTestId("desktop-navigation")).toBeHidden();
        await expect(page.getByTestId("mobile-menu-button")).toBeVisible();
      } else {
        const navigation = page.getByTestId("desktop-navigation");
        await expect(navigation).toBeVisible();
        for (const item of locale.headerItems) {
          await expect(
            navigation.getByRole("link", { name: item, exact: true }),
          ).toBeVisible();
        }
        await expect(page.getByTestId("mobile-menu-button")).toBeHidden();
      }
      await expect(page.getByTestId("mobile-navigation")).toHaveCount(0);
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

test("cabinet is a primary destination on desktop and mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/ru/cabinet");
  await page.getByTestId("mobile-menu-button").click();
  await expect(
    page.getByRole("link", { name: "Обзор", exact: true }),
  ).toHaveAttribute("aria-current", "page");

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(
    page
      .getByTestId("desktop-navigation")
      .getByRole("link", { name: "Моя подготовка" }),
  ).toHaveAttribute("aria-current", "page");
});

test("tablet overflow navigation exposes secondary routes and closes", async ({
  page,
}) => {
  await installShellFixture(page);
  await page.setViewportSize({ width: 1024, height: 880 });

  for (const destination of tabletOverflowDestinations) {
    await page.goto("/en/tasks");
    const more = page.getByTitle("More");
    const menu = more.locator("..");
    await more.click();
    await menu
      .getByRole("link", { name: destination.label, exact: true })
      .click();

    await expect(page).toHaveURL(new RegExp(`${destination.path}$`));
    await expect(menu).not.toHaveAttribute("open", "");
  }
});

test("desktop navigation exposes only actionable destinations", async ({
  page,
}) => {
  await installShellFixture(page);
  await page.setViewportSize({ width: 1440, height: 900 });

  for (const destination of desktopDestinations) {
    await page.goto("/en/tasks");
    const navigation = page.getByTestId("desktop-navigation");
    await expect(navigation).toHaveAttribute("aria-label", "Main navigation");
    await expect(navigation.locator('[aria-disabled="true"]')).toHaveCount(0);
    await navigation
      .getByRole("link", { name: destination.label, exact: true })
      .click();

    await expect(page).toHaveURL(new RegExp(`${destination.path}$`));
    await expect(page.getByTestId("site-header")).toHaveAttribute(
      "data-placement",
      "application",
    );
    await expect(
      page
        .getByTestId("desktop-navigation")
        .getByRole("link", { name: destination.label, exact: true }),
    ).toHaveAttribute("aria-current", "page");
  }
});

test("application menus dismiss with Escape and restore trigger focus", async ({
  page,
}) => {
  await installShellFixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/en/tasks");

  const mobileButton = page.getByTestId("mobile-menu-button");
  await mobileButton.focus();
  await mobileButton.press("Enter");
  const mobileMenu = page.locator("#mobile-app-menu");
  await expect(mobileMenu).toBeVisible();
  await expect(
    mobileMenu.getByRole("link", { name: "Overview", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(mobileMenu).not.toBeVisible();
  await expect(mobileButton).toBeFocused();

  await page.setViewportSize({ width: 1024, height: 880 });
  await page.goto("/en/tasks");
  const more = page.getByTitle("More");
  const overflowMenu = more.locator("..");
  await more.focus();
  await more.press("Enter");
  await expect(overflowMenu).toHaveJSProperty("open", true);
  await more.press("Escape");
  await expect(overflowMenu).toHaveJSProperty("open", false);
  await expect(more).toBeFocused();
});

test("profile menu dismisses with Escape and restores trigger focus", async ({
  page,
}) => {
  await page.route("**/api/v1/me", (route) =>
    route.fulfill({
      json: {
        id: "00000000-0000-4000-8000-000000000152",
        email: "student@example.test",
        name: "Student",
      },
    }),
  );
  await page.route("**/graphql", (route) =>
    route.fulfill({
      json: { data: { attempts: [], completedSimulationRuns: [] } },
    }),
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/en/tasks");

  const profileMenu = page
    .getByTestId("site-header")
    .locator("details")
    .filter({ hasText: "Student" });
  const trigger = profileMenu.locator("summary");
  await trigger.focus();
  await trigger.press("Enter");
  await expect(profileMenu).toHaveJSProperty("open", true);
  await trigger.press("Escape");
  await expect(profileMenu).toHaveJSProperty("open", false);
  await expect(trigger).toBeFocused();
});

test("mobile navigation reaches every exposed application destination", async ({
  page,
}) => {
  await installShellFixture(page);
  await page.setViewportSize({ width: 390, height: 844 });

  for (const destination of mobileDestinations) {
    await page.goto("/en/tasks");
    await page.getByTestId("mobile-menu-button").click();
    const menu = page.locator("#mobile-app-menu");
    await menu
      .getByRole("link", { name: destination.label, exact: true })
      .click();

    await expect(page).toHaveURL(new RegExp(`${destination.path}$`));
    await expect(menu).not.toBeVisible();
  }
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
    page.getByRole("heading", { name: "Ничего не найдено" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Сбросить все фильтры" }).click();
  await expect(page).toHaveURL(/\/ru\/tasks$/);
  await expect(page.getByText("30 заданий", { exact: true })).toBeVisible();
});

test("task-bank maps Figma controls to real P1 workflows", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/ru/tasks");

  const taskBank = page.getByTestId("task-bank");
  await expect(taskBank.getByText("Физика", { exact: true })).toHaveCount(0);
  await expect(taskBank.getByText("Избранное", { exact: true })).toHaveCount(0);
  await expect(taskBank.getByText("Мои наборы", { exact: true })).toHaveCount(
    0,
  );
  await expect(
    taskBank.getByRole("link", { name: "История", exact: true }),
  ).toHaveAttribute("href", "/ru/history?tab=tasks");
  await expect(
    taskBank.getByRole("link", { name: "План", exact: true }),
  ).toHaveAttribute("href", "/ru/prep");

  await taskBank.getByRole("tab", { name: "Новые", exact: true }).click();
  await expect(page).toHaveURL(/progress=new/);
  await expect(page.getByText("30 заданий", { exact: true })).toBeVisible();

  await taskBank.getByRole("tab", { name: "Ошибки", exact: true }).click();
  await expect(page).toHaveURL(/progress=incorrect/);
  await expect(
    taskBank.getByRole("heading", { name: "Ничего не найдено" }),
  ).toBeVisible();

  await taskBank.getByRole("tab", { name: "Все задания", exact: true }).click();
  await expect(page).toHaveURL(/\/ru\/tasks$/);
  await taskBank.getByRole("button", { name: "Поз.", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Фильтры" })).toBeVisible();
});

test("selected tasks form a bounded practice sequence and return intact", async ({
  page,
}) => {
  await installAnalyticsSpy(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/ru/tasks");
  await page.getByRole("checkbox", { name: "Выбрать задание kb-001" }).check();
  await page.getByRole("checkbox", { name: "Выбрать задание kv-001" }).check();
  await expect(page.getByText("Выбрано: 2", { exact: true })).toBeVisible();
  await expect(page.getByText("Добавить в набор", { exact: true })).toHaveCount(
    0,
  );

  await page.evaluate(() => window.scrollTo({ top: 600 }));
  await page.getByRole("link", { name: "Решать выбранные задания" }).click();

  await expect(page).toHaveURL(/set=kb-001%2Ckv-001/);
  await expect(page.getByText("1 из 2 заданий", { exact: true })).toBeVisible();
  await expect(page.getByTestId("site-header")).toBeVisible();

  await page.getByRole("textbox", { name: "t", exact: true }).fill("1");
  await page
    .getByRole("textbox", { name: "|z|", exact: true })
    .fill("3sqrt(2)");
  await page.getByRole("textbox", { name: "Re z", exact: true }).fill("3");
  await page.getByRole("textbox", { name: "Im z", exact: true }).fill("-3");
  await page.getByRole("button", { name: "Проверить" }).click();
  await expect(page.getByText("Верно!", { exact: true })).toBeVisible();
  expect(await analyticsEvents(page)).toContainEqual({
    event: "task-solved",
    data: { source: "practice", position: 1, helpLevel: 0 },
  });
  await page.getByRole("link", { name: "Следующее задание" }).click();
  await expect(page).toHaveURL(/\/kvadratna-jednacina\/kv-001\?/);
  await expect(page.getByText("2 из 2 заданий", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Назад к практике" }).click();
  await expect(page).toHaveURL(/\/ru\/tasks\?selected=kb-001&selected=kv-001$/);
  await expect(page.getByText("Выбрано: 2", { exact: true })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(500);
});

test("the maximum multipart task remains usable on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/en/tasks/kvadratna-jednacina/kv-003");

  const fields = page.getByRole("textbox");
  await expect(fields).toHaveCount(6);
  await fields.last().scrollIntoViewIfNeeded();
  const lastField = await fields.last().boundingBox();
  expect(lastField).not.toBeNull();
  expect(lastField?.x).toBeGreaterThanOrEqual(0);
  expect((lastField?.x ?? 0) + (lastField?.width ?? 0)).toBeLessThanOrEqual(
    360,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await expect(
    page.getByRole("button", { name: "Check", exact: true }),
  ).toBeVisible();
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

async function installShellFixture(page: Page) {
  await page.route("**/api/v1/me", (route) =>
    route.fulfill({ status: 401, body: "" }),
  );
  await page.route("**/graphql", (route) =>
    route.fulfill({
      json: { data: { attempts: [], completedSimulationRuns: [] } },
    }),
  );
}
