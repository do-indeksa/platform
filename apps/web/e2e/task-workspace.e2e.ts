import { expect, test } from "@playwright/test";

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
