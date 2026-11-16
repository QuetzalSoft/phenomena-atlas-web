import { describe, expect, it } from "vitest";
import {
  blank,
  blankPaths,
  formulaText,
  nodeAt,
  referencedKeys,
  renameKey,
  replaceAt,
  size,
  usableCharacteristics,
  wrap,
  type WeightingExpression,
} from "./weighting-tree";

const population: WeightingExpression = { kind: "population" };
const count: WeightingExpression = { kind: "aggregate", function: "count" };
const sumOf = (key: string): WeightingExpression => ({ kind: "aggregate", function: "sum", characteristicKey: key });
const number = (value: number): WeightingExpression => ({ kind: "number", value });
const op = (operator: "add" | "subtract" | "multiply" | "divide", left: WeightingExpression, right: WeightingExpression): WeightingExpression => ({
  kind: "operation",
  operator,
  left,
  right,
});

const labels: Record<string, string> = { severity: "Severity", victims: "Victims" };
const labelOf = (key: string) => labels[key] ?? key;

describe("navigating the tree by the API's paths", () => {
  const tree = op("multiply", op("divide", sumOf("severity"), population), number(1000));

  it("finds a node by its path", () => {
    expect(nodeAt(tree, "/weightingFunction")).toBe(tree);
    expect(nodeAt(tree, "/weightingFunction/left/right")).toEqual(population);
    expect(nodeAt(tree, "/weightingFunction/right/left")).toBeUndefined();
  });

  it("replaces one node and leaves the rest untouched", () => {
    const replaced = replaceAt(tree, "/weightingFunction/left/right", count);
    expect(formulaText(replaced, labelOf)).toBe("Sum of Severity ÷ Number of reports × 1000");
    expect(formulaText(tree, labelOf)).toBe("Sum of Severity ÷ Population × 1000");
    expect(replaceAt(tree, "/weightingFunction", blank)).toEqual(blank);
  });

  it("wraps a node as the left side of a new operation", () => {
    expect(wrap(population, "divide")).toEqual(op("divide", population, blank));
  });

  it("lists the blanks in reading order", () => {
    expect(blankPaths(op("add", blank, op("divide", count, blank)))).toEqual(["/weightingFunction/left", "/weightingFunction/right/right"]);
    expect(blankPaths(tree)).toEqual([]);
  });

  it("measures nodes and depth as the API does", () => {
    expect(size(tree)).toEqual({ nodes: 5, depth: 3 });
  });
});

describe("the formula as text", () => {
  it("adds only the parentheses the tree needs", () => {
    expect(formulaText(op("multiply", op("add", count, number(1)), population), labelOf)).toBe("(Number of reports + 1) × Population");
    expect(formulaText(op("add", op("multiply", count, number(2)), population), labelOf)).toBe("Number of reports × 2 + Population");
    expect(formulaText(op("subtract", count, op("subtract", number(1), number(2))), labelOf)).toBe("Number of reports − (1 − 2)");
    expect(formulaText(op("divide", count, op("divide", number(1), number(2))), labelOf)).toBe("Number of reports ÷ (1 ÷ 2)");
  });

  it("marks blanks", () => {
    expect(formulaText(op("divide", count, blank), labelOf)).toBe("Number of reports ÷ ?");
  });
});

describe("characteristics in the function", () => {
  it("offers only active numbers, yes/no and categories", () => {
    const usable = usableCharacteristics([
      { type: "number", key: "victims", label: "Victims", required: false, retired: false, integer: true },
      { type: "boolean", key: "weapon", label: "Weapon", required: false, retired: true },
      { type: "text", key: "notes", label: "Notes", required: false, retired: false, maxLength: 10 },
      { type: "category", key: "severity", label: "Severity", required: false, retired: false, options: [] },
    ]);
    expect(usable.map((characteristic) => characteristic.key)).toEqual(["victims", "severity"]);
  });

  it("follows a key that is renamed", () => {
    const tree = op("add", sumOf("victim"), op("divide", sumOf("victim"), sumOf("severity")));
    const renamed = renameKey(tree, "victim", "victims");
    expect([...referencedKeys(renamed)].sort()).toEqual(["severity", "victims"]);
  });
});
