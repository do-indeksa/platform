import { all, create } from "mathjs/number";
import type { EvalFunction, MathNode } from "mathjs";

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
const SAMPLE_GRID = [
  -8.35, -5.05, -3.15, -1.55, -0.45, 0.35, 1.35, 2.7, 4.15, 5.85, 7.45, 9.05,
  11.65,
];
const MIN_SAMPLE_MATCHES = 3;

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
    .replace(/≤/g, "<=")
    .replace(/≥/g, ">=")
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
  s = s.replace(/\s+/g, "");
  if (kind !== "value" && s.includes(";")) s = s.replace(/,/g, ".");
  s = s
    .replace(/(sqrt|ln)(x|\d+(?:\.\d+)?)(?![\da-z(])/g, "$1($2)")
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

function isDecimalLiteral(s: string): boolean {
  return /^[+-]?\d+(\.\d+)?$/.test(s);
}

function matches(expected: number, given: number, literal: boolean): boolean {
  return literal ? expected === given : near(expected, given);
}

function valueEquals(expected: string, given: string): boolean {
  const expectedNode = math.parse(expected);
  const givenNode = math.parse(given);
  if (usesX(expectedNode) || usesX(givenNode)) {
    return sampledEquals(expectedNode, givenNode);
  }
  return matches(
    toNumber(expectedNode),
    toNumber(givenNode),
    isDecimalLiteral(given),
  );
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
  let compared = 0;
  for (const x of SAMPLE_GRID) {
    const want = numberAt(expectedFn, x);
    if (want === null || !Number.isFinite(want)) continue;
    const got = numberAt(givenFn, x);
    if (got === null || !near(want, got)) return false;
    compared++;
  }
  if (compared < MIN_SAMPLE_MATCHES) {
    throw new Error("expected expression undefined on the sample grid");
  }
  return true;
}

function numberAt(fn: EvalFunction, x: number): number | null {
  const value = fn.evaluate({ x }) as unknown;
  if (typeof value !== "number") throw new Error("expression is not numeric");
  return Number.isNaN(value) ? null : value;
}

function toNumber(node: MathNode): number {
  const value = node.compile().evaluate() as unknown;
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error("expression is not a number");
  }
  return value;
}

function near(a: number, b: number): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return a === b;
  if (a === b) return true;
  return Math.abs(a - b) <= EPSILON * Math.max(1, Math.abs(a), Math.abs(b));
}

type ListedValue = { value: number; literal: boolean };

function valueList(s: string): ListedValue[] {
  const inner = unwrapBraces(stripLead(s));
  return splitTop(inner, ",;").flatMap((element) => {
    const bare = stripLead(element);
    if (bare.startsWith("±")) {
      const body = bare.slice(1);
      const value = toNumber(math.parse(body));
      const literal = isDecimalLiteral(body);
      return [
        { value, literal },
        { value: -value, literal },
      ];
    }
    return [
      { value: toNumber(math.parse(bare)), literal: isDecimalLiteral(bare) },
    ];
  });
}

function unwrapBraces(s: string): string {
  return s.startsWith("{") && s.endsWith("}") ? s.slice(1, -1) : s;
}

function multisetEquals(want: ListedValue[], got: ListedValue[]): boolean {
  if (want.length !== got.length) return false;
  const used = Array<boolean>(got.length).fill(false);
  return want.every((w) => {
    const i = got.findIndex(
      (g, j) => !used[j] && matches(w.value, g.value, g.literal),
    );
    if (i === -1) return false;
    used[i] = true;
    return true;
  });
}

type Bound = { value: number; open: boolean; literal: boolean };

type Interval = { lo: Bound; hi: Bound };

function intervalList(s: string): Interval[] {
  return splitTop(s, "u;").map(parseInterval);
}

function parseInterval(s: string): Interval {
  const interval = inequalityInterval(s) ?? bracketInterval(s);
  if (!(interval.lo.value < interval.hi.value)) {
    throw new Error("empty interval");
  }
  return interval;
}

function bracketInterval(s: string): Interval {
  const match = /^([([])(.+)([)\]])$/.exec(s);
  if (!match) throw new Error("not an interval");
  const bounds = splitTop(match[2], ",;");
  if (bounds.length !== 2) throw new Error("interval needs two bounds");
  return {
    lo: bound(bounds[0], match[1] === "("),
    hi: bound(bounds[1], match[3] === ")"),
  };
}

function inequalityInterval(s: string): Interval | null {
  let match = /^(.+?)(<=|<)x(<=|<)(.+)$/.exec(s);
  if (match) {
    return {
      lo: bound(match[1], match[2] === "<"),
      hi: bound(match[4], match[3] === "<"),
    };
  }
  match = /^x(<=|<)(.+)$/.exec(s);
  if (match) {
    return { lo: infinite(-1), hi: bound(match[2], match[1] === "<") };
  }
  match = /^x(>=|>)(.+)$/.exec(s);
  if (match) {
    return { lo: bound(match[2], match[1] === ">"), hi: infinite(1) };
  }
  return null;
}

function bound(expr: string, open: boolean): Bound {
  return {
    value: toNumber(math.parse(expr)),
    open,
    literal: isDecimalLiteral(expr),
  };
}

function infinite(sign: 1 | -1): Bound {
  return { value: sign * Infinity, open: true, literal: false };
}

function unionEquals(want: Interval[], got: Interval[]): boolean {
  if (want.length !== got.length) return false;
  const byLo = (a: Interval, b: Interval) => a.lo.value - b.lo.value;
  const sortedWant = want.toSorted(byLo);
  const sortedGot = got.toSorted(byLo);
  return sortedWant.every((w, i) => {
    const g = sortedGot[i];
    return sameBound(w.lo, g.lo) && sameBound(w.hi, g.hi);
  });
}

function sameBound(want: Bound, got: Bound): boolean {
  return want.open === got.open && matches(want.value, got.value, got.literal);
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
