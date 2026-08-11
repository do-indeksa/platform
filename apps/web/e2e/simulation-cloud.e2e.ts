import { expect, test } from "@playwright/test";
import type { E2EGraphQLCall } from "./diagnostic-cloud-fixture";
import {
  installSimulationCloudRoutes,
  simulationCloudFixture,
  simulationRunId,
  simulationRunUrl,
} from "./simulation-cloud-fixture";

test("a fresh signed-in browser resumes the active mock with its original deadline", async ({
  page,
}) => {
  const mutations: E2EGraphQLCall[] = [];
  const fixture = await simulationCloudFixture({
    draft: ["cloud-answer", "", "", ""],
    currentOrdinal: 2,
  });
  await installSimulationCloudRoutes(page, fixture, mutations);

  await page.goto("/en/simulation");
  await page
    .getByRole("link", { name: "Continue mock exam", exact: true })
    .click();

  await expect(page).toHaveURL(new RegExp(`run=${simulationRunId}`));
  await expect(
    page.getByRole("heading", { name: "Task 2 of 10", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("timer")).toContainText("03:");
  await page.getByRole("button", { name: "Task 1: answered" }).click();
  await expect(page.getByRole("textbox").first()).toHaveValue("cloud-answer");
  await expect(
    page.getByText("Saved to your account", { exact: true }),
  ).toBeVisible();

  const persisted = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("do-indeksa-simulation") as string),
  );
  expect(persisted.version).toBe(9);
  expect(persisted.state).toMatchObject({
    runId: simulationRunId,
    phase: "running",
    startedAt: Date.parse(fixture.run.startedAt),
  });
  expect(persisted.state.answers[0]).toEqual(["cloud-answer", "", "", ""]);
  expect(persisted.state.endsAt - persisted.state.startedAt).toBe(240 * 60_000);
  expect(mutations.some((call) => call.operationName === "RecordAttempt")).toBe(
    false,
  );
});

test("a conflicting device copy is forked only after the cloud run is abandoned", async ({
  page,
}) => {
  await page.goto(simulationRunUrl);
  await page.getByRole("textbox").first().fill("device-answer");
  const local = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("do-indeksa-simulation") as string),
  );
  expect(local.state.runId).toBe(simulationRunId);

  const mutations: E2EGraphQLCall[] = [];
  const fixture = await simulationCloudFixture({
    draft: ["cloud-answer", "", "", ""],
    startedAt: new Date(local.state.startedAt).toISOString(),
  });
  await installSimulationCloudRoutes(page, fixture, mutations);
  await page.reload();

  await expect(
    page.getByRole("heading", {
      name: "Two versions of this mock exam were found",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Keep device version", exact: true })
    .click();

  await expect
    .poll(() => new URL(page.url()).searchParams.get("run"))
    .not.toBe(simulationRunId);
  await expect(
    page.getByRole("heading", { name: "Task 1 of 10", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("textbox").first()).toHaveValue("device-answer");
  expect(mutations[0]).toMatchObject({
    operationName: "AbandonRun",
    variables: { input: { id: simulationRunId } },
  });

  const forked = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("do-indeksa-simulation") as string),
  );
  expect(forked.state.runId).not.toBe(simulationRunId);
  expect(forked.state.checkpointVersion).toBeGreaterThanOrEqual(0);
  expect(forked.state.answers[0][0]).toBe("device-answer");
});
