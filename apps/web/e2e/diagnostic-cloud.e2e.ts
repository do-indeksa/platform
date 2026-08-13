import { expect, test } from "./test";
import {
  cloudFixture,
  type E2EGraphQLCall,
  installCloudRoutes,
  localDiagnosticState,
  runId,
  runUrl,
} from "./diagnostic-cloud-fixture";

test("a fresh signed-in browser hydrates a compatible active diagnostic", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const fixture = await cloudFixture({ completed: 2, draft: ["3"] });
  const mutationCalls: E2EGraphQLCall[] = [];
  await installCloudRoutes(page, fixture, mutationCalls);

  await page.goto("/en/diagnostic");
  await expect(
    page.getByRole("link", { name: "Continue diagnostic" }),
  ).toBeVisible();
  await expect(
    page.getByText("2 of 10 positions completed. Your run is saved."),
  ).toBeVisible();

  await page.getByRole("link", { name: "Continue diagnostic" }).click();
  await expect(page).toHaveURL(new RegExp(`/en/diagnostic/new\\?run=${runId}`));
  await expect(
    page.getByText("Diagnostic · 3 of 10", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("textbox").first()).toHaveValue("3");
  await expect
    .poll(
      () =>
        mutationCalls.filter((call) => call.operationName === "CheckpointRun")
          .length,
    )
    .toBe(1);

  const checkpoint = mutationCalls.find(
    (call) => call.operationName === "CheckpointRun",
  );
  expect(checkpoint?.variables.input).toMatchObject({
    id: runId,
    expectedVersion: 3,
    currentOrdinal: 3,
    drafts: [{ answer: '["3"]' }],
  });
  const persisted = await page.evaluate(() =>
    localStorage.getItem("do-indeksa-diagnostic"),
  );
  expect(persisted).not.toMatch(/statement|solution|expected/i);
});

test("a fully attempted active run resumes its interrupted submission", async ({
  page,
}) => {
  const fixture = await cloudFixture({ completed: 10, draft: [] });
  const mutationCalls: E2EGraphQLCall[] = [];
  await installCloudRoutes(page, fixture, mutationCalls);

  await page.goto(runUrl);
  await expect(page).toHaveURL(/\/en\/diagnostic\/result\?/);
  await expect(
    page.getByRole("heading", { name: "Your starting level" }),
  ).toBeVisible();
  await expect
    .poll(
      () =>
        mutationCalls.filter((call) => call.operationName === "SubmitRun")
          .length,
    )
    .toBe(1);
});

test("a divergent device draft is forked instead of overwriting cloud state", async ({
  page,
}) => {
  const fixture = await cloudFixture({
    completed: 0,
    draft: ["remote", "", "", ""],
    checkpointVersion: 2,
  });
  const local = localDiagnosticState(fixture, ["local", "", "", ""]);
  await page.addInitScript((state) => {
    localStorage.setItem(
      "do-indeksa-diagnostic",
      JSON.stringify({ version: 3, state }),
    );
  }, local);
  const mutationCalls: E2EGraphQLCall[] = [];
  await installCloudRoutes(page, fixture, mutationCalls);

  await page.goto("/en/diagnostic");
  await expect(
    page.getByRole("heading", { name: "Choose which progress to continue" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Keep this device" }).click();

  await expect(page).toHaveURL(/\/en\/diagnostic\/new\?run=/);
  const nextUrl = new URL(page.url());
  const forkedRunId = nextUrl.searchParams.get("run");
  expect(forkedRunId).toMatch(/^[0-9a-f-]{36}$/);
  expect(forkedRunId).not.toBe(runId);
  await expect(page.getByRole("textbox").first()).toHaveValue("local");
  await expect
    .poll(() =>
      mutationCalls.some(
        (call) =>
          call.operationName === "CheckpointRun" &&
          call.variables.input?.id === forkedRunId,
      ),
    )
    .toBe(true);

  expect(
    mutationCalls.find((call) => call.operationName === "AbandonRun")?.variables
      .input,
  ).toEqual({ id: runId });
  const forkedCheckpoint = mutationCalls.find(
    (call) =>
      call.operationName === "CheckpointRun" &&
      call.variables.input?.id === forkedRunId,
  );
  expect(forkedCheckpoint?.variables.input).toMatchObject({
    expectedVersion: 0,
    currentOrdinal: 1,
    drafts: [{ answer: '["local","","",""]' }],
  });
});

test("a failed explicit abandon keeps the local diagnostic recoverable", async ({
  page,
}) => {
  let abandonCalls = 0;
  await page.route("**/api/v1/me", (route) =>
    route.fulfill({
      json: {
        id: "39ec4650-762d-437f-9917-c31ab167cb99",
        email: "portfolio@example.test",
        name: "Portfolio User",
      },
    }),
  );
  await page.route("**/api/v1/attempts", (route) =>
    route.fulfill({ status: 410 }),
  );
  await page.route("**/graphql", async (route) => {
    const call = route.request().postDataJSON() as E2EGraphQLCall;
    if (call.operationName === "DiagnosticRunIndex") {
      await route.fulfill({ json: { data: { runs: [] } } });
      return;
    }
    if (call.operationName === "AttemptJournal") {
      await route.fulfill({ json: { data: { attempts: [] } } });
      return;
    }
    if (call.operationName === "HistoryRuns") {
      await route.fulfill({
        json: {
          data: { runs: [], latestSubmittedDiagnostic: null },
        },
      });
      return;
    }
    if (call.operationName === "CompletedSimulationArchive") {
      await route.fulfill({
        json: { data: { completedSimulationRuns: [] } },
      });
      return;
    }
    const input = call.variables.input as Record<string, unknown>;
    if (call.operationName === "StartRun") {
      await route.fulfill({
        json: { data: { startRun: { id: input.id, status: "ACTIVE" } } },
      });
      return;
    }
    if (call.operationName === "CheckpointRun") {
      await route.fulfill({
        json: {
          data: {
            checkpointRun: {
              version: Number(input.expectedVersion) + 1,
              currentOrdinal: input.currentOrdinal,
            },
          },
        },
      });
      return;
    }
    if (call.operationName === "AbandonRun") {
      abandonCalls += 1;
      await route.fulfill({
        json: {
          data: null,
          errors: [
            {
              message: "temporarily unavailable",
              extensions: { code: "INTERNAL" },
            },
          ],
        },
      });
      return;
    }
    await route.fulfill({ status: 500 });
  });

  await page.goto(runUrl);
  await expect(
    page.getByText("Diagnostic · 1 of 10", { exact: true }),
  ).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Leave diagnostic" }).click();

  await expect(
    page.getByText(
      "The saved run could not be removed. Your work is still available on this device.",
    ),
  ).toBeVisible();
  expect(abandonCalls).toBe(1);
  expect(page.url()).toContain(`/en/diagnostic/new?run=${runId}`);
  const persisted = await page.evaluate(() =>
    localStorage.getItem("do-indeksa-diagnostic"),
  );
  expect(persisted).toContain(runId);
  expect(persisted).toContain('"phase":"running"');
});
