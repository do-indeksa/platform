import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import ru from "../../messages/ru.json";
import sr from "../../messages/sr.json";
import { htmlLanguage, routing } from "./routing";

function messageKeys(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [prefix];
  }

  return Object.entries(value).flatMap(([key, nested]) =>
    messageKeys(nested, prefix ? `${prefix}.${key}` : key),
  );
}

describe("locale routing", () => {
  it("keeps Serbian canonical while exposing English and Russian routes", () => {
    expect(routing.locales).toEqual(["sr", "en", "ru"]);
    expect(routing.defaultLocale).toBe("sr");
    expect(routing.localePrefix).toBe("as-needed");
    expect(routing.localeDetection).toBe(false);
  });

  it("uses explicit document language tags", () => {
    expect(htmlLanguage("sr")).toBe("sr-Latn");
    expect(htmlLanguage("en")).toBe("en");
    expect(htmlLanguage("ru")).toBe("ru");
  });

  it("keeps every message catalog structurally complete", () => {
    const canonical = messageKeys(sr).sort();
    expect(messageKeys(en).sort()).toEqual(canonical);
    expect(messageKeys(ru).sort()).toEqual(canonical);
  });

  it("uses product terminology instead of the implementation route name", () => {
    expect(sr.nav.simulation).toBe("Probni ispit");
    expect(en.nav.simulation).toBe("Mock exam");
    expect(ru.nav.simulation).toBe("Пробный экзамен");
  });
});
