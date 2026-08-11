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
  expect(persisted.version).toBe(10);
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

test("a fresh browser recovers an interrupted rubric review", async ({
  page,
}) => {
  const mutations: E2EGraphQLCall[] = [];
  const fixture = await simulationCloudFixture({ draft: [] });
  const submittedAt = new Date(
    Date.parse(fixture.run.startedAt) + 30_000,
  ).toISOString();
  for (const [index, item] of fixture.run.items.entries()) {
    const answer = index === 0 ? '["wrong","","",""]' : null;
    item.recentAttempts = [
      simulationAttempt(item, fixture.run.startedAt, submittedAt, {
        id: simulationAutoAttemptIds[index],
        answer,
        outcome: index === 0 ? "INCORRECT" : "SKIPPED",
        gradingKind: "AUTO",
        earnedPoints: index === 0 ? 0 : null,
      }),
    ];
  }
  await installSimulationCloudRoutes(page, fixture, mutations);

  await page.goto(simulationRunUrl);

  await expect(
    page.getByRole("heading", { name: "Compare your written work" }),
  ).toBeVisible();
  await expect(page.getByText("Task 1 of 6", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "2", exact: true }).click();
  await expect
    .poll(
      () =>
        mutations.filter((call) => call.operationName === "CheckpointRun")
          .length,
    )
    .toBe(1);
  const checkpoint = mutations.find(
    (call) => call.operationName === "CheckpointRun",
  );
  const drafts = checkpoint?.variables.input?.drafts as
    | {
        answer: string;
      }[]
    | undefined;
  expect(drafts).toBeDefined();
  expect(JSON.parse(drafts![0].answer)).toEqual({
    version: 1,
    answers: ["wrong", "", "", ""],
    rubricScore: 2,
  });

  await page.evaluate(() => localStorage.removeItem("do-indeksa-simulation"));
  await page.reload();

  await expect(
    page.getByRole("heading", { name: "Compare your written work" }),
  ).toBeVisible();
  await expect(page.getByText("Task 2 of 6", { exact: true })).toBeVisible();
  const persisted = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("do-indeksa-simulation") as string),
  );
  expect(persisted.state).toMatchObject({
    phase: "reviewing",
    submittedAt: Date.parse(submittedAt),
    rubricScores: [2, null, null, null, null, null, ...Array(4).fill(null)],
  });
  expect(
    mutations.filter((call) => call.operationName === "RecordAttempt"),
  ).toHaveLength(20);
  expect(mutations.some((call) => call.operationName === "SubmitRun")).toBe(
    false,
  );
});

const simulationAutoAttemptIds = [
  "6fb1f40b-707b-5abf-9b76-770dc0c0c217",
  "345611fe-1fe0-54b8-b1ce-740cca7c1104",
  "efa618f6-f638-5f3b-b885-09e5c1f0fc93",
  "9fade9dd-94b0-5c66-998b-5424f65ddeb4",
  "e04b0d3d-4b9d-501d-af5e-f3e87dab5207",
  "611029e2-de1b-568b-9436-6555bf432e96",
  "3aedbe66-015e-50b9-bce2-a35daabc9a76",
  "651ac088-74fb-5554-b8e3-4cd104e9ecd5",
  "3fc8ce4f-602e-59d2-a093-fa60106703e5",
  "2ed2ae6d-f9a6-5d51-8663-e5c371c642e2",
];

function simulationAttempt(
  item: Awaited<
    ReturnType<typeof simulationCloudFixture>
  >["run"]["items"][number],
  startedAt: string,
  submittedAt: string,
  attempt: {
    id: string;
    answer: string | null;
    outcome: "INCORRECT" | "PARTIAL" | "SKIPPED";
    gradingKind: "AUTO" | "RUBRIC_SELF";
    earnedPoints: number | null;
  },
) {
  return {
    ...attempt,
    runItemId: item.id,
    taskId: item.taskId,
    examPosition: item.examPosition,
    mode: "SIMULATION",
    startedAt,
    submittedAt,
    activeDurationMs: null,
    helpLevel: 0,
    maxPoints: item.maxPoints,
    taskRevision: item.taskRevision,
  };
}
