import { describe, expect, it } from "vitest";
import { buildLocaleHref, buildLocalePathname } from "./locale-navigation";

describe("locale navigation", () => {
  it("localizes ordinary paths and preserves query and fragment data", () => {
    expect(buildLocalePathname("/", "sr")).toBe("/");
    expect(buildLocalePathname("/", "en")).toBe("/en");
    expect(buildLocalePathname("/tasks/algebra", "ru")).toBe(
      "/ru/tasks/algebra",
    );
    expect(
      buildLocaleHref(
        "/tasks",
        "en",
        "source=official&next=%2Fprep",
        "#task-2",
      ),
    ).toBe("/en/tasks?source=official&next=%2Fprep#task-2");
  });

  it.each([
    "//evil.example",
    "///evil.example",
    String.raw`/\evil.example`,
    "/%2fevil.example",
    "/%5cevil.example",
    "/%2e%2e//evil.example",
    "/tasks/..//evil.example",
    "https://evil.example/tasks",
    "tasks",
  ])("fails closed for an ambiguous pathname: %s", (pathname) => {
    expect(buildLocalePathname(pathname, "sr")).toBe("/");
    expect(buildLocalePathname(pathname, "en")).toBe("/en");
  });

  it("keeps repeated slashes inside an established local path same-origin", () => {
    const href = buildLocaleHref(
      "/tasks//algebra",
      "en",
      "next=//evil.example",
      "#</script>",
    );
    const resolved = new URL(href, "https://doindeksa.rs");

    expect(resolved.origin).toBe("https://doindeksa.rs");
    expect(resolved.pathname).toBe("/en/tasks//algebra");
    expect(resolved.search).toBe("?next=//evil.example");
    expect(resolved.hash).toBe("#%3C/script%3E");
  });
});
