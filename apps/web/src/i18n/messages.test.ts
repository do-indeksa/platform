import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import ru from "../../messages/ru.json";
import sr from "../../messages/sr.json";

const locales = [
  { locale: "sr", messages: sr, legacyTerms: /\b(?:slot\w*|simulacij\w*)\b/iu },
  { locale: "en", messages: en, legacyTerms: /\b(?:slots?|simulations?)\b/iu },
  { locale: "ru", messages: ru, legacyTerms: /(?:слот|симуляц)/iu },
] as const;

describe("user-facing terminology", () => {
  for (const { locale, messages, legacyTerms } of locales) {
    it(`${locale} uses product terms instead of internal identifiers`, () => {
      const copy = strings(messages).join("\n");

      expect(copy).not.toMatch(legacyTerms);
      expect(copy).not.toMatch(/(?:\bP2\b|physics|fizik|физик)/iu);
    });
  }

  it("keeps the canonical Serbian navigation terms", () => {
    expect(sr.nav.overview).toBe("Pregled");
    expect(sr.nav.preparation).toBe("Moja priprema");
    expect(sr.nav.training).toBe("Vežbanje");
    expect(sr.nav.examsShort).toBe("Ispiti");
    expect(sr.nav.simulation).toBe("Probni ispit");
    expect(sr.taskBank.positionFilter).toContain("Pozicija");
  });
});

function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (typeof value === "object" && value !== null) {
    return Object.values(value).flatMap(strings);
  }
  return [];
}
