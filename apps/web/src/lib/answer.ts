import { all, create } from "mathjs/number";
import type { MathNode } from "mathjs";

const math = create(all);

export type CheckKind = "value" | "values" | "interval" | "text";

export type CheckPart = {
  label?: string;
  kind: CheckKind;
  expected: string;
};

export type CheckResult = "correct" | "incorrect" | "invalid";

const MAX_INPUT_LENGTH = 200;
const EPSILON = 1e-9;
const SAMPLE_POINTS = [-1.55, 0.35, 1.35, 2.7];
const MIN_SAMPLE_MATCHES = 2;

export function checkAnswer(part: CheckPart, input: string): CheckResult {
  if (input.length > MAX_INPUT_LENGTH) return "invalid";
  try {
    const expected = normalize(part.expected, part.kind);
    const given = normalize(input, part.kind);
    if (given === "") return "invalid";
    return equals(part.kind, expected, given) ? "correct" : "incorrect";
  } catch {
    return "invalid";
  }
}

function normalize(raw: string, kind: CheckKind): string {
  let s = raw.toLowerCase();
  s = s
    .replace(/[−–]/g, "-")
    .replace(/[×·]/g, "*")
    .replace(/÷/g, "/")
    .replace(/°/g, "")
    .replace(/√/g, "sqrt")
    .replace(/π/g, "pi")
    .replace(/∞/g, "inf")
    .replace(/∪/g, "u")
    .replace(/∈/g, "=")
    .replace(/\+-|-\+/g, "±")
    .replace(/koren/g, "sqrt")
    .replace(/beskona[cč]no/g, "inf")
    .replace(/infinity/g, "inf");
  if (kind === "value") s = s.replace(/,/g, ".");
  s = s
    .replace(/\s+/g, "")
    .replace(/(sqrt|log10|log2|log|ln)(\d+(?:\.\d+)?)(?![\d(])/g, "$1($2)")
    .replace(/log(?!10|2)/g, "log10")
    .replace(/ln/g, "log");
  return s.replace(/inf/g, "Infinity");
}

function equals(kind: CheckKind, expected: string, given: string): boolean {
  switch (kind) {
    case "value":
      return valueEquals(expected, stripLead(given));
    case "values":
      return multisetEquals(valueList(expected), valueList(given));
    case "interval":
      return unionEquals(
        intervalList(expected),
        intervalList(stripLead(given)),
      );
    case "text":
      return expected === given;
  }
}

function stripLead(s: string): string {
  return s.replace(/^[a-z][a-z0-9]{0,3}(\(x\))?=/, "");
}

function valueEquals(expected: string, given: string): boolean {
  const expectedNode = math.parse(expected);
  const givenNode = math.parse(given);
  if (usesX(expectedNode) || usesX(givenNode)) {
    return sampledEquals(expectedNode, givenNode);
  }
  return near(toNumber(expectedNode), toNumber(givenNode));
}

function usesX(node: MathNode): boolean {
  return (
    node.filter((n) => n.type === "SymbolNode" && "name" in n && n.name === "x")
      .length > 0
  );
}

function sampledEquals(expected: MathNode, given: MathNode): boolean {
  const expectedFn = expected.compile();
  const givenFn = given.compile();
  let matches = 0;
  for (const x of SAMPLE_POINTS) {
    const want = expectedFn.evaluate({ x }) as unknown;
    const got = givenFn.evaluate({ x }) as unknown;
    if (typeof want !== "number" || typeof got !== "number") {
      throw new Error("expression is not numeric");
    }
    if (Number.isNaN(want) && Number.isNaN(got)) continue;
    if (Number.isNaN(want) || Number.isNaN(got)) return false;
    if (!near(want, got)) return false;
    matches++;
  }
  if (matches < MIN_SAMPLE_MATCHES) throw new Error("domains barely overlap");
  return true;
}

function toNumber(node: MathNode): number {
  const value = node.compile().evaluate() as unknown;
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error("expression is not a number");
  }
  return value;
}

function near(a: number, b: number): boolean {
  if (a === b) return true;
  return Math.abs(a - b) <= EPSILON * Math.max(1, Math.abs(a), Math.abs(b));
}

function valueList(s: string): number[] {
  return splitTop(unwrapBraces(s), ",;").flatMap((element) => {
    const bare = stripLead(element);
    if (bare.startsWith("±")) {
      const value = toNumber(math.parse(bare.slice(1)));
      return [value, -value];
    }
    return [toNumber(math.parse(bare))];
  });
}

function unwrapBraces(s: string): string {
  return s.startsWith("{") && s.endsWith("}") ? s.slice(1, -1) : s;
}

function multisetEquals(want: number[], got: number[]): boolean {
  if (want.length !== got.length) return false;
  const used = Array<boolean>(got.length).fill(false);
  return want.every((value) => {
    const i = got.findIndex((g, j) => !used[j] && near(value, g));
    if (i === -1) return false;
    used[i] = true;
    return true;
  });
}

type Interval = { lo: number; hi: number; loOpen: boolean; hiOpen: boolean };

function intervalList(s: string): Interval[] {
  return splitTop(s, "u;").map(parseInterval);
}

function parseInterval(s: string): Interval {
  const match = /^([([])(.+)([)\]])$/.exec(s);
  if (!match) throw new Error("not an interval");
  const bounds = splitTop(match[2], ",");
  if (bounds.length !== 2) throw new Error("interval needs two bounds");
  const lo = toNumber(math.parse(bounds[0]));
  const hi = toNumber(math.parse(bounds[1]));
  if (!(lo < hi)) throw new Error("empty interval");
  return { lo, hi, loOpen: match[1] === "(", hiOpen: match[3] === ")" };
}

function unionEquals(want: Interval[], got: Interval[]): boolean {
  if (want.length !== got.length) return false;
  const byLo = (a: Interval, b: Interval) => a.lo - b.lo;
  const sortedWant = want.toSorted(byLo);
  const sortedGot = got.toSorted(byLo);
  return sortedWant.every((w, i) => {
    const g = sortedGot[i];
    return (
      near(w.lo, g.lo) &&
      near(w.hi, g.hi) &&
      w.loOpen === g.loOpen &&
      w.hiOpen === g.hiOpen
    );
  });
}

function splitTop(s: string, separators: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const char = s[i];
    if ("([{".includes(char)) depth++;
    else if (")]}".includes(char)) depth--;
    else if (depth === 0 && separators.includes(char)) {
      parts.push(s.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(s.slice(start));
  return parts;
}
