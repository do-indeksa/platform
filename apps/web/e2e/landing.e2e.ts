import { expect, test, type Page } from "./test";

const localizedLandings = [
  {
    path: "/",
    pageHeight: 6120,
    heading: "Spremi P1 za siguran upis",
    flows: "Izaberi način pripreme",
    details: "Detalji P1",
    programs: "FTN programi za P1",
    start: "Počni besplatno",
    localeTarget: "EN",
    localizedTargetPath: "/en",
  },
  {
    path: "/en",
    pageHeight: 6263,
    heading: "Master FTN P1 before exam day",
    flows: "Choose your P1 preparation mode",
    details: "P1 details",
    programs: "FTN programs using P1",
    start: "Start for free",
    localeTarget: "RU",
    localizedTargetPath: "/ru",
  },
  {
    path: "/ru",
    pageHeight: 6311,
    heading: "Освойте P1 до экзамена",
    flows: "Выберите формат подготовки к P1",
    details: "О формате P1",
    programs: "Программы FTN с экзаменом P1",
    start: "Начать бесплатно",
    localeTarget: "SR",
    localizedTargetPath: "/",
  },
] as const;

const marketingSections = [
  "p1-paths",
  "about-platform",
  "features",
  "ftn-programs",
  "how-it-works",
] as const;

const landingDestinations = [
  "/tasks",
  "/exams?q=P1",
  "/diagnostic",
  "/simulation",
  "/faculties/ftn",
] as const;

for (const locale of localizedLandings) {
  test(`${locale.path} exposes the real P1 landing flow`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(locale.path, { waitUntil: "domcontentloaded" });

    await expect(page.getByTestId("marketing-header")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: locale.heading, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: locale.flows, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: locale.details, exact: true }),
    ).toHaveAttribute("href", /\/exams\?q=P1$/);
    await expect(
      page.getByRole("heading", { name: locale.programs, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: locale.start, exact: true }),
    ).toHaveAttribute("href", /\/tasks$/);
    await expect(page.getByText(/30/).first()).toBeVisible();
    await expect(page.getByText(/P2 ·/)).toHaveCount(0);
    await expect(page.getByText(/Physics|Физика|Fizika/)).toHaveCount(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollHeight),
    ).toBe(locale.pageHeight);
    await expectTextToFit(page);
    await expectNoHorizontalOverflow(page);

    await page.setViewportSize({ width: 1024, height: 880 });
    await expectTextToFit(page);
    await expectNoHorizontalOverflow(page);

    await page.setViewportSize({ width: 1440, height: 900 });
    await expectTextToFit(page);
    await expectNoHorizontalOverflow(page);
  });
}

test("SR landing follows the exact Figma section geometry", async ({
  page,
}) => {
  const cases = [
    {
      viewport: { width: 390, height: 844 },
      pageHeight: 6120,
      x: 16,
      width: 358,
      sections: [
        ["marketing-header-inner", 0, 64],
        ["about-platform", 64, 736],
        ["features", 800, 912],
        ["p1-paths", 1712, 874],
        ["ftn-programs", 2586, 2276],
        ["how-it-works", 4862, 750],
        ["start", 5612, 460],
      ],
    },
    {
      viewport: { width: 1024, height: 880 },
      pageHeight: 3094,
      x: 56,
      width: 912,
      sections: [
        ["marketing-header-inner", 0, 80],
        ["about-platform", 80, 620],
        ["features", 700, 448],
        ["p1-paths", 1148, 392],
        ["ftn-programs", 1540, 888],
        ["how-it-works", 2428, 286],
        ["start", 2714, 300],
      ],
    },
    {
      viewport: { width: 1440, height: 900 },
      pageHeight: 2898,
      x: 80,
      width: 1280,
      sections: [
        ["marketing-header-inner", 0, 92],
        ["about-platform", 92, 620],
        ["features", 712, 240],
        ["p1-paths", 952, 392],
        ["ftn-programs", 1344, 888],
        ["how-it-works", 2232, 286],
        ["start", 2518, 300],
      ],
    },
  ] as const;

  await page.setViewportSize(cases[0].viewport);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  for (const item of cases) {
    await page.setViewportSize(item.viewport);
    for (const [id, y, height] of item.sections) {
      const locator =
        id === "marketing-header-inner"
          ? page.getByTestId(id)
          : page.locator(`#${id}`);
      await expect(locator).toBeVisible();
      const box = await locator.boundingBox();
      expect(box).not.toBeNull();
      expect(Math.round(box?.x ?? -1)).toBe(item.x);
      expect(Math.round(box?.y ?? -1)).toBe(y);
      expect(Math.round(box?.width ?? -1)).toBe(item.width);
      expect(Math.round(box?.height ?? -1)).toBe(height);
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollHeight),
    ).toBe(item.pageHeight);
    await expectTextToFit(page);
    await expectNoHorizontalOverflow(page);
  }
});

test("marketing menus are keyboard operable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/en");

  const button = page.getByTestId("marketing-menu-button");
  await button.focus();
  await button.press("Enter");
  const menu = page.locator("#mobile-marketing-menu");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("link", { name: "Exams" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).not.toBeVisible();
  await expect(button).toBeFocused();

  await page.setViewportSize({ width: 1024, height: 880 });
  await page.goto("/en");
  const summary = page.getByTitle("More links");
  const details = summary.locator("..");
  await summary.focus();
  await summary.press("Enter");
  await expect(details).toHaveJSProperty("open", true);
  await summary.press("Escape");
  await expect(details).toHaveJSProperty("open", false);
  await expect(summary).toBeFocused();
});

for (const locale of localizedLandings) {
  test(`${locale.path} marketing navigation reaches every section`, async ({
    page,
  }) => {
    const viewports = [
      { name: "mobile", width: 390, height: 844 },
      { name: "tablet", width: 1024, height: 880 },
      { name: "desktop", width: 1440, height: 900 },
    ] as const;

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      for (const section of marketingSections) {
        await page.goto(locale.path, { waitUntil: "domcontentloaded" });
        await expectMarketingReady(page);

        if (viewport.name === "mobile") {
          await page.getByTestId("marketing-menu-button").click();
        } else if (
          viewport.name === "tablet" &&
          (section === "ftn-programs" || section === "how-it-works")
        ) {
          await page.locator("header nav > details > summary").click();
        }

        await page.locator(`header nav a[href$="#${section}"]:visible`).click();

        await expect(page).toHaveURL(new RegExp(`#${section}$`));
        await expect(page.locator(`#${section}`)).toBeInViewport();
        if (viewport.name === "mobile") {
          await expect(
            page.locator("#mobile-marketing-menu"),
          ).not.toBeVisible();
        }
      }
    }
  });

  test(`${locale.path} calls to action reach usable product routes`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    for (const destination of landingDestinations) {
      await page.goto(locale.path, { waitUntil: "domcontentloaded" });
      const expectedPath = localizedPath(locale.path, destination);
      await page.locator(`main a[href="${expectedPath}"]`).first().click();

      await expect(page).toHaveURL(new RegExp(`${escapeRegex(expectedPath)}$`));
      await expect(page.locator("h1")).toBeVisible();
    }
  });

  test(`${locale.path} locale controls preserve query and section`, async ({
    page,
  }) => {
    const suffix = "?source=landing-smoke#features";
    const expected = `${locale.localizedTargetPath}${suffix}`;

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${locale.path}${suffix}`, {
      waitUntil: "domcontentloaded",
    });
    await page
      .getByRole("group")
      .getByRole("link", { name: locale.localeTarget, exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`${escapeRegex(expected)}$`));
    await expect(page.locator("#features")).toBeInViewport();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${locale.path}${suffix}`, {
      waitUntil: "domcontentloaded",
    });
    await page
      .getByRole("combobox")
      .selectOption(locale.localeTarget.toLowerCase());
    await expect(page).toHaveURL(new RegExp(`${escapeRegex(expected)}$`));
    await expect(page.locator("#features")).toBeInViewport();
  });
}

test("an authenticated visitor gets the Figma app header on landing", async ({
  page,
}) => {
  await page.route("**/api/v1/me", async (route) => {
    await route.fulfill({
      json: {
        id: "11111111-1111-4111-8111-111111111111",
        email: "student@example.test",
        name: "Student",
      },
    });
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/en", { waitUntil: "domcontentloaded" });

  await expect(page.getByTestId("site-header")).toBeVisible();
  await expect(page.getByTestId("marketing-header")).toHaveCount(0);
  const header = await page.getByTestId("site-header").boundingBox();
  expect(header).not.toBeNull();
  expect(Math.round(header?.x ?? -1)).toBe(80);
  expect(Math.round(header?.width ?? -1)).toBe(1280);
  expect(Math.round(header?.height ?? -1)).toBe(72);
});

async function expectNoHorizontalOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}

async function expectTextToFit(page: Page) {
  const overflow = await page
    .locator("[data-fit-text], [data-fit-container]")
    .evaluateAll((nodes) =>
      nodes
        .filter(
          (node) =>
            node.scrollWidth > node.clientWidth + 1 ||
            node.scrollHeight > node.clientHeight + 1,
        )
        .map((node) => ({
          text: node.textContent?.trim(),
          client: [node.clientWidth, node.clientHeight],
          scroll: [node.scrollWidth, node.scrollHeight],
        })),
    );
  expect(overflow).toEqual([]);
}

function localizedPath(localePath: string, destination: string): string {
  return `${localePath === "/" ? "" : localePath}${destination}`;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function expectMarketingReady(page: Page): Promise<void> {
  await expect(
    page
      .getByTestId("marketing-desktop-actions")
      .locator('a[href^="/api/v1/auth/google"]'),
  ).toHaveCount(1);
}
