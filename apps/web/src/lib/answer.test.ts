import { describe, expect, it } from "vitest";
import { checkAnswer, type CheckPart } from "./answer";

const value = (expected: string): CheckPart => ({ kind: "value", expected });
const values = (expected: string): CheckPart => ({ kind: "values", expected });
const interval = (expected: string): CheckPart => ({
  kind: "interval",
  expected,
});

describe("value answers", () => {
  it.each([
    ["6", "6"],
    ["6", " 6 "],
    ["6", "6.0"],
    ["6", "12/2"],
    ["6", "x=6"],
    ["0.5", "1/2"],
    ["0.5", "0,5"],
    ["2sqrt(3)", "sqrt(12)"],
    ["2sqrt(3)", "2√3"],
    ["2sqrt(3)", "2*koren(3)"],
    ["2sqrt(3)", "2 sqrt 3".replace(/ /g, "")],
    ["sqrt(3)/9", "1/(3sqrt(3))"],
    ["pi/3", "π/3"],
    ["pi/3", "2pi/6"],
    ["(e^2+1)/4", "e^2/4+1/4"],
    ["11/2+ln(2)", "5.5+ln2"],
    ["ln(e)", "1"],
    ["log(100)", "2"],
    ["log2(8)", "3"],
    ["ln(5)/ln(2)", "log2(5)"],
    ["-8", "−8"],
    ["60", "60°"],
    ["3/8", "0.375"],
  ])("accepts %s ≡ %s", (expected, input) => {
    expect(checkAnswer(value(expected), input)).toBe("correct");
  });

  it.each([
    ["6", "5"],
    ["6", "-6"],
    ["2sqrt(3)", "3sqrt(2)"],
    ["2sqrt(3)", "3.46"],
    ["pi/3", "pi/4"],
    ["2", "1/0"],
  ])("rejects %s vs %s", (expected, input) => {
    expect(checkAnswer(value(expected), input)).toBe("incorrect");
  });

  it.each([
    ["2sqrt(3)", "3.464101615"],
    ["sqrt(2)", "1.414213562"],
    ["pi/3", "1.047197551"],
    ["1/3", "0,3333333333"],
  ])("rejects the calculator decimal %s vs %s", (expected, input) => {
    expect(checkAnswer(value(expected), input)).toBe("incorrect");
  });

  it("does not accept a calculator decimal hidden inside arithmetic", () => {
    expect(checkAnswer(value("sqrt(2)"), "1.414213562+0")).toBe("incorrect");
  });

  it.each([
    ["6", ""],
    ["6", "abc("],
    ["6", "2+"],
    ["6", "šest"],
    ["log(25)", "log25"],
    ["log2(5)", "log25"],
    ["log(100)", "log100"],
    ["5", "log100"],
  ])("flags %s vs %j as invalid", (expected, input) => {
    expect(checkAnswer(value(expected), input)).toBe("invalid");
  });

  it("caps input length", () => {
    expect(checkAnswer(value("6"), "1+".repeat(200) + "1")).toBe("invalid");
  });

  it.each(["random()", "factorial(10)", "10!", "[6]", "x=x=6"])(
    "rejects unsupported expression %s",
    (input) => {
      expect(checkAnswer(value("6"), input)).toBe("invalid");
    },
  );
});

describe("expression answers in x", () => {
  it.each([
    ["-2x+2", "2-2x"],
    ["-2x+2", "y=-2x+2"],
    ["-2x+2", "y = -2*x + 2"],
    ["x/2+2", "0.5x+2"],
    ["x+2", "f(x)=x+2"],
    ["2sqrt(x)", "2√x"],
    ["sqrt(x)+1", "√x + 1"],
    ["sqrt(x-3)", "sqrt(x-3)"],
    ["ln(x-3)", "ln(x-3)"],
    ["1/(2sqrt(x-3))", "1/(2*koren(x-3))"],
  ])("accepts %s ≡ %s", (expected, input) => {
    expect(checkAnswer(value(expected), input)).toBe("correct");
  });

  it.each([
    ["-2x+2", "2x+2"],
    ["-2x+2", "-2x-2"],
    ["x+2", "2"],
    ["sqrt(x-3)", "sqrt(x-2)"],
  ])("rejects %s vs %s", (expected, input) => {
    expect(checkAnswer(value(expected), input)).toBe("incorrect");
  });

  it("flags an unknown symbol as invalid", () => {
    expect(checkAnswer(value("-2x+2"), "-2y+2")).toBe("invalid");
  });
});

describe("values answers", () => {
  it.each([
    ["4,sqrt(2)", "sqrt(2), 4"],
    ["-3,3", "{-3, 3}"],
    ["-3,3", "±3"],
    ["-3,3", "+-3"],
    ["-3,3", "x=±3"],
    ["0,2", "x1=0, x2=2"],
    ["0,2", "2;0"],
    ["-pi/2,0,pi/2", "{-π/2, 0, π/2}"],
    ["2pi/3,pi,4pi/3", "pi, 2pi/3, 4pi/3"],
    ["-3,3", "x∈{-3, 3}"],
    ["1.5, 2", "1,5;2"],
  ])("accepts %s ≡ %s", (expected, input) => {
    expect(checkAnswer(values(expected), input)).toBe("correct");
  });

  it.each([
    ["-3,3", "3"],
    ["-3,3", "3,3"],
    ["-3,3", "-3,3,0"],
    ["0,2", "0,3"],
    ["-sqrt(2),sqrt(2)", "±1.414213562"],
  ])("rejects %s vs %s", (expected, input) => {
    expect(checkAnswer(values(expected), input)).toBe("incorrect");
  });

  it("flags a malformed element as invalid", () => {
    expect(checkAnswer(values("-3,3"), "-3,")).toBe("invalid");
  });
});

describe("interval answers", () => {
  it.each([
    ["(-1,3]", "( -1 , 3 ]"],
    ["(-1,3]", "x∈(-1,3]"],
    ["(-Infinity,0)u(2,Infinity)", "(-inf,0)U(2,+inf)"],
    ["(-Infinity,0)u(2,Infinity)", "(2,∞)∪(-∞,0)"],
    ["(-Infinity,0)u(2,Infinity)", "(-beskonacno,0)u(2,beskonačno)"],
    ["(-pi,-pi/2)u(pi/2,pi]", "(-π,-π/2) U (π/2,π]"],
    ["[-1,3]", "[-1,3]"],
    ["(-1,3]", "-1<x<=3"],
    ["(-1,3]", "-1 < x ≤ 3"],
    ["(2,Infinity)", "x>2"],
    ["(sqrt(2),Infinity)", "x>sqrt(2)"],
    ["[1,Infinity)", "x>=1"],
    ["(-Infinity,0)u(2,Infinity)", "x<0 u x>2"],
    ["(1.5,3)", "(1,5;3)"],
    ["(-1,3]", "(-1;3]"],
  ])("accepts %s ≡ %s", (expected, input) => {
    expect(checkAnswer(interval(expected), input)).toBe("correct");
  });

  it.each([
    ["(-1,3]", "[-1,3]"],
    ["(-1,3]", "(-1,3)"],
    ["(-1,3]", "(-1,2]"],
    ["(-Infinity,0)u(2,Infinity)", "(-inf,0)"],
    ["(0,pi/3]", "(0,1.047197551]"],
    ["(2,Infinity)", "x>=2"],
  ])("rejects %s vs %s", (expected, input) => {
    expect(checkAnswer(interval(expected), input)).toBe("incorrect");
  });

  it("does not accept a decimal approximation hidden in an interval bound", () => {
    expect(checkAnswer(interval("(sqrt(2),Infinity)"), "x>1.414213562+0")).toBe(
      "incorrect",
    );
  });

  it.each([
    ["(-1,3]", "3,1"],
    ["(-1,3]", "(3,1)"],
    ["(-1,3]", "(1)"],
  ])("flags %s vs %s as invalid", (expected, input) => {
    expect(checkAnswer(interval(expected), input)).toBe("invalid");
  });
});

describe("text answers", () => {
  it("compares normalized strings", () => {
    expect(checkAnswer({ kind: "text", expected: "da" }, " DA ")).toBe(
      "correct",
    );
    expect(checkAnswer({ kind: "text", expected: "da" }, "ne")).toBe(
      "incorrect",
    );
  });
});
