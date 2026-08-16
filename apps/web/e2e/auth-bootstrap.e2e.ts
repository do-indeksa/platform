import { expect, test, type Page } from "./test";
import { runUrl as diagnosticRunUrl } from "./diagnostic-cloud-fixture";
import { simulationRunUrl } from "./simulation-cloud-fixture";

const USER_ID = "39ec4650-762d-437f-9917-c31ab167cb99";

test("a transient auth failure keeps the application shell mounted", async ({
  page,
}) => {
  let available = false;
  await page.route("**/api/v1/me", (route) =>
    available
      ? route.fulfill({ status: 401, body: "" })
      : route.fulfill({ status: 503 }),
  );

  await page.goto("/en/tasks");

  const header = page.getByTestId("site-header");
  await expect(header).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Tasks", exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("auth-bootstrap-error")).toBeVisible();
  await header.evaluate((element) => {
    element.setAttribute("data-persistence-probe", "mounted");
  });

  available = true;
  await page.getByRole("button", { name: "Try again" }).click();

  await expect(page.getByTestId("auth-bootstrap-error")).toHaveCount(0);
  await expect(header).toHaveAttribute("data-persistence-probe", "mounted");
  await expect(header.locator('a[href^="/api/v1/auth/google"]')).toBeVisible();
});

test("a transient auth failure preserves an active diagnostic", async ({
  page,
}) => {
  const auth = await installFlakyAuth(page);
  await page.goto(diagnosticRunUrl);
  await expect(
    page.getByText("Diagnostic · 1 of 10", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "t", exact: true })
    .fill("owner draft");
  await expect
    .poll(() => diagnosticDraft(page))
    .toEqual({
      answer: "owner draft",
      ownerId: USER_ID,
    });

  auth.fail();
  await page.reload();
  await expect(page.getByTestId("auth-bootstrap-error")).toBeVisible();
  await expect
    .poll(() => diagnosticDraft(page))
    .toEqual({
      answer: "owner draft",
      ownerId: USER_ID,
    });

  auth.restore();
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(
    page.getByRole("textbox", { name: "t", exact: true }),
  ).toHaveValue("owner draft");
});

test("a transient auth failure preserves an active mock exam", async ({
  page,
}) => {
  const auth = await installFlakyAuth(page);
  await page.goto(simulationRunUrl);
  await expect(
    page.getByRole("heading", { name: "Task 1 of 10" }),
  ).toBeVisible();
  await page.getByRole("textbox").first().fill("owner mock draft");
  await expect
    .poll(() => simulationDraft(page))
    .toEqual({
      answer: "owner mock draft",
      ownerId: USER_ID,
    });

  auth.fail();
  await page.reload();
  await expect(page.getByTestId("auth-bootstrap-error")).toBeVisible();
  await expect
    .poll(() => simulationDraft(page))
    .toEqual({
      answer: "owner mock draft",
      ownerId: USER_ID,
    });

  auth.restore();
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("textbox").first()).toHaveValue(
    "owner mock draft",
  );
});

async function installFlakyAuth(page: Page) {
  let available = true;
  await page.route("**/api/v1/me", (route) =>
    available
      ? route.fulfill({
          json: {
            id: USER_ID,
            email: "portfolio@example.test",
            name: "Portfolio User",
          },
        })
      : route.fulfill({ status: 503 }),
  );
  await page.route("**/api/v1/attempts", (route) =>
    route.fulfill({ status: 410 }),
  );
  await page.route("**/graphql", (route) => route.fulfill({ status: 503 }));

  return {
    fail: () => {
      available = false;
    },
    restore: () => {
      available = true;
    },
  };
}

async function diagnosticDraft(page: Page) {
  return page.evaluate(() => {
    const state = JSON.parse(
      localStorage.getItem("do-indeksa-diagnostic") as string,
    ).state;
    return { answer: state.answers[0][0], ownerId: state.runOwnerId };
  });
}

async function simulationDraft(page: Page) {
  return page.evaluate(() => {
    const state = JSON.parse(
      localStorage.getItem("do-indeksa-simulation") as string,
    ).state;
    return { answer: state.answers[0][0], ownerId: state.runOwnerId };
  });
}
