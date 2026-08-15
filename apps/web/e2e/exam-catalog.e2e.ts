import { expect, test } from "./test";

test("catalog exposes the official FTN exam model and P1 preparation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/exams");

  await expect(
    page.getByRole("heading", { name: "Prijemni ispiti", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("7 prijemnih grupa", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("P1", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("P3", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("P2", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/fizik/i)).toHaveCount(0);

  await page.getByRole("link", { name: "Otvori P1" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("heading", { name: "Spremi P1 za siguran upis" }),
  ).toBeVisible();
});

test("catalog search resolves a program to its required exam and recovers", async ({
  page,
}) => {
  await page.goto("/exams");
  const search = page.getByRole("searchbox", {
    name: "Pretraži prijemne ispite i studijske programe",
  });

  await search.fill("racunarstvo");
  await expect(page).toHaveURL(/\/exams\?q=racunarstvo$/);
  await expect(
    page.getByText("1 prijemna grupa", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Računarstvo i automatika (E2)", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("P1", { exact: true }).first()).toBeVisible();

  await search.fill("nepostojeci program");
  await expect(
    page.getByRole("heading", {
      name: "Nema odgovarajuće prijemne grupe",
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Prikaži sve prijemne ispite" })
    .click();
  await expect(page).toHaveURL(/\/exams$/);
  await expect(
    page.getByText("7 prijemnih grupa", { exact: true }),
  ).toBeVisible();
});

test("planned exams remain informative instead of looking broken", async ({
  page,
}) => {
  await page.goto("/exams/ftn-p3");

  await expect(
    page.getByRole("heading", { name: "Matematika sa logikom" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Priprema još nije dostupna" }),
  ).toBeVisible();
  await expect(
    page.getByText("Industrijsko inženjerstvo", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Zvanične prijemne grupe" }),
  ).toHaveAttribute("href", "https://ftn.uns.ac.rs/upis/pet-zelja/");
});

test("faculty guide maps every program to an exam and preserves P1", async ({
  page,
}) => {
  await page.goto("/faculties/ftn");

  await expect(
    page.getByRole("heading", { name: "Fakultet tehničkih nauka" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "29 programa u 7 prijemnih grupa" }),
  ).toBeVisible();
  await expect(
    page.getByText("Softversko inženjerstvo i informacione tehnologije", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Pripremi se" })).toHaveCount(10);
  await expect(page.getByRole("link", { name: "Detalji ispita" })).toHaveCount(
    19,
  );
});

for (const locale of [
  { path: "/exams", title: "Prijemni ispiti" },
  { path: "/en/exams", title: "Entrance exams" },
  { path: "/ru/exams", title: "Вступительные экзамены" },
]) {
  for (const viewport of [
    { name: "mobile", width: 360, height: 800 },
    { name: "desktop", width: 1440, height: 900 },
  ]) {
    test(`${locale.title} catalog fits ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto(locale.path);

      await expect(
        page.getByRole("heading", { name: locale.title, exact: true }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    });
  }
}
