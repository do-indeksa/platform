import { expect, test } from "./test";

const practiceId = "00000000-0000-4000-8000-000000000161";
const localeCases = [
  {
    prefix: "",
    locale: "sr-Latn",
    heading: "Vežbanje · Pozicija 3 · Logaritmi",
    toggle: "Sakrij uslov",
  },
  {
    prefix: "/en",
    locale: "en",
    heading: "Practice · Position 3 · Logarithms",
    toggle: "Hide problem",
  },
  {
    prefix: "/ru",
    locale: "ru",
    heading: "Практика · Позиция 3 · Логарифмы",
    toggle: "Скрыть условие",
  },
] as const;
const responsiveViewports = [
  { name: "mobile", width: 390, height: 800 },
  { name: "tablet", width: 1024, height: 900 },
  { name: "desktop", width: 1440, height: 900 },
] as const;
const railGeometryCases = [
  {
    name: "mobile",
    width: 390,
    height: 800,
    itemWidth: 56,
    itemHeight: 56,
    markerOffsetX: 28,
    markerOffsetY: 28,
    railAxis: "horizontal",
    railAxisOffset: 47,
  },
  {
    name: "tablet",
    width: 1024,
    height: 900,
    itemWidth: 126,
    itemHeight: 64,
    markerOffsetX: 25,
    markerOffsetY: 32,
    railAxis: "horizontal",
    railAxisOffset: 52,
  },
  {
    name: "desktop",
    width: 1440,
    height: 900,
    itemWidth: 214,
    itemHeight: 58,
    markerOffsetX: 29,
    markerOffsetY: 29,
    railAxis: "vertical",
    railAxisOffset: 48,
  },
] as const;

test.beforeEach(async ({ page }) => {
  await page.route("**/api/v1/me", (route) =>
    route.fulfill({ status: 401, body: "" }),
  );
});

for (const localeCase of localeCases) {
  for (const viewport of responsiveViewports) {
    test(`${localeCase.locale} task workspace fits ${viewport.name}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto(
        `${localeCase.prefix}/tasks/logaritmi/log-001?returnTo=%2Ftasks&set=kb-001%2Ckv-001%2Clog-001%2Ceks-001%2Ctrig-001&practice=${practiceId}`,
      );

      await expect(page.locator("html")).toHaveAttribute(
        "lang",
        localeCase.locale,
      );
      await expect(
        page.getByRole("heading", {
          name: localeCase.heading,
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: localeCase.toggle, exact: true }),
      ).toBeVisible();
      await expect(page.getByTestId("task-question-panel")).toBeVisible();
      await expect(page.getByTestId("task-help-panel")).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    });
  }
}

for (const viewport of railGeometryCases) {
  test(`task rail markers stay centered at ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(
      ({ practice }) => {
        const draft = (partCount: number, state: "solved" | "skipped") =>
          JSON.stringify({
            answers: Array<string>(partCount).fill(""),
            view: state === "solved" ? "correct" : "solution",
            attempted: true,
            hintsShown: 0,
            solved: state === "solved",
            burned: state === "skipped",
            dirty: false,
          });
        sessionStorage.setItem(
          `do-indeksa-task-draft-v1:${practice}:kb-001`,
          draft(4, "solved"),
        );
        sessionStorage.setItem(
          `do-indeksa-task-draft-v1:${practice}:kv-001`,
          draft(1, "skipped"),
        );
        sessionStorage.setItem(
          `do-indeksa-task-draft-v1:${practice}:log-001`,
          JSON.stringify({
            answers: ["persisted"],
            view: "form",
            attempted: false,
            hintsShown: 0,
            solved: false,
            burned: false,
            dirty: true,
          }),
        );
      },
      { practice: practiceId },
    );
    await page.goto(
      `/tasks/logaritmi/log-001?returnTo=%2Ftasks&set=kb-001%2Ckv-001%2Clog-001%2Ceks-001&practice=${practiceId}`,
    );

    await expect(page.getByTestId("task-workspace")).toHaveAttribute(
      "data-draft-state",
      "ready",
    );
    await expect(page.getByRole("textbox").first()).toHaveValue("persisted");

    const items = page.locator("[data-task-rail-item]");
    await expect(items).toHaveCount(4);
    await expect
      .poll(() =>
        items.evaluateAll((elements) =>
          elements.map((element) => element.getAttribute("data-task-status")),
        ),
      )
      .toEqual(["solved", "skipped", "active", "pending"]);

    const geometry = await items.evaluateAll((elements, railAxis) => {
      const rail = elements[0]?.closest<HTMLElement>(
        '[data-testid="task-workspace-rail"]',
      );
      if (!rail) throw new Error("task rail is missing");
      const railRect = rail.getBoundingClientRect();
      return elements.map((element) => {
        const item = element.getBoundingClientRect();
        const marker = element
          .querySelector<HTMLElement>("[data-task-rail-marker]")
          ?.getBoundingClientRect();
        if (!marker) throw new Error("task rail marker is missing");
        const markerCenterX = marker.left + marker.width / 2;
        const markerCenterY = marker.top + marker.height / 2;
        return {
          itemWidth: item.width,
          itemHeight: item.height,
          markerWidth: marker.width,
          markerHeight: marker.height,
          markerOffsetX: markerCenterX - item.left,
          markerOffsetY: markerCenterY - item.top,
          railAxisOffset:
            railAxis === "horizontal"
              ? markerCenterY - railRect.top
              : markerCenterX - railRect.left,
        };
      });
    }, viewport.railAxis);

    for (const item of geometry) {
      expect(item).toEqual({
        itemWidth: viewport.itemWidth,
        itemHeight: viewport.itemHeight,
        markerWidth: 34,
        markerHeight: 34,
        markerOffsetX: viewport.markerOffsetX,
        markerOffsetY: viewport.markerOffsetY,
        railAxisOffset: viewport.railAxisOffset,
      });
    }
  });
}

test("the task workspace exposes its Figma regions and a real condition toggle", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto(
    `/tasks/eksponencijalne/eks-001?returnTo=%2Ftasks&set=kb-001%2Ckv-001%2Ceks-001&practice=${practiceId}`,
  );

  await expect(page.getByTestId("site-header")).toBeVisible();
  await expect(page.getByTestId("task-workspace-rail")).toBeVisible();
  await expect(page.getByTestId("task-question-panel")).toBeVisible();
  await expect(page.getByTestId("task-help-panel")).toBeVisible();
  await expect(page.getByTestId("task-workspace-navigation")).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Vežbanje · Pozicija 4 · Eksponencijalne jednačine",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Rešiti jednačinu", { exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Sakrij uslov" }).click();
  await expect(page.getByText("Rešiti jednačinu", { exact: true })).toHaveCount(
    0,
  );
  await expect(
    page.getByText("Uslov je sakriven. Prikaži ga kada želiš da nastaviš.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Prikaži uslov" }).click();
  await expect(
    page.getByText("Rešiti jednačinu", { exact: true }),
  ).toBeVisible();

  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("skip records an honest attempt and restores the rail status", async ({
  page,
}) => {
  await page.goto(
    `/tasks/kompleksni-brojevi/kb-001?returnTo=%2Ftasks&set=kb-001%2Ckv-001&practice=${practiceId}`,
  );
  await page.getByRole("textbox", { name: "t", exact: true }).fill("1");
  await page.getByRole("button", { name: "Preskoči", exact: true }).click();

  await expect(page).toHaveURL(/\/kvadratna-jednacina\/kv-001\?/);
  await expect(
    page.getByRole("link", { name: "Zadatak 1: Preskočeno", exact: true }),
  ).toBeVisible();

  const persisted = await page.evaluate(
    ({ taskId, practice }) => {
      const attemptsRaw = localStorage.getItem("do-indeksa-attempts");
      const draftRaw = sessionStorage.getItem(
        `do-indeksa-task-draft-v1:${practice}:${taskId}`,
      );
      return {
        attempts: attemptsRaw ? JSON.parse(attemptsRaw).attempts : [],
        draft: draftRaw ? JSON.parse(draftRaw) : null,
      };
    },
    { taskId: "kb-001", practice: practiceId },
  );
  expect(persisted.attempts).toHaveLength(1);
  expect(persisted.attempts[0].input).toMatchObject({
    outcome: "SKIPPED",
    helpLevel: 0,
  });
  expect(persisted.draft).toMatchObject({
    attempted: true,
    solved: false,
    burned: true,
    dirty: false,
  });
});
