import type { components } from "@quetzalsoft/phenomena-atlas-contract";

export type WeightingExpression = components["schemas"]["WeightingExpression"];
export type WeightingOperator = components["schemas"]["WeightingOperator"];
export type AggregateFunction = components["schemas"]["AggregateFunction"];
type Characteristic = components["schemas"]["Characteristic"];

/**
 * Where a node sits in the tree, as the API's error `details.path` names it: the root is
 * `/weightingFunction` and each step down is `/left` or `/right`.
 */
export type NodePath = string;

export const rootPath: NodePath = "/weightingFunction";

export const blank: WeightingExpression = { kind: "blank" };

export const operatorInfo: Record<WeightingOperator, { label: string; symbol: string }> = {
  add: { label: "Add", symbol: "+" },
  subtract: { label: "Subtract", symbol: "−" },
  multiply: { label: "Multiply", symbol: "×" },
  divide: { label: "Divide", symbol: "÷" },
};

export const operators = Object.keys(operatorInfo) as WeightingOperator[];

export const aggregateInfo: Record<AggregateFunction, { label: string; needsCharacteristic: boolean }> = {
  count: { label: "Number of reports", needsCharacteristic: false },
  sum: { label: "Sum", needsCharacteristic: true },
  mean: { label: "Mean", needsCharacteristic: true },
  min: { label: "Minimum", needsCharacteristic: true },
  max: { label: "Maximum", needsCharacteristic: true },
};

export const aggregateFunctions = Object.keys(aggregateInfo) as AggregateFunction[];

/** The API's limits on the size of the tree. */
export const maxNodes = 100;
export const maxDepth = 20;

/** The node at `path`, or undefined when the path leads nowhere. */
export function nodeAt(tree: WeightingExpression, path: NodePath): WeightingExpression | undefined {
  let node: WeightingExpression | undefined = tree;
  for (const step of steps(path)) {
    node = node?.kind === "operation" ? node[step] : undefined;
  }
  return node;
}

/** A copy of the tree with the node at `path` replaced. */
export function replaceAt(tree: WeightingExpression, path: NodePath, replacement: WeightingExpression): WeightingExpression {
  const go = (node: WeightingExpression, rest: ("left" | "right")[]): WeightingExpression => {
    const [step, ...more] = rest;
    if (!step) {
      return replacement;
    }
    if (node.kind !== "operation") {
      throw new Error(`No node at ${path}.`);
    }
    return { ...node, [step]: go(node[step], more) };
  };
  return go(tree, steps(path));
}

/** The node as the left side of a new operation whose right side is still to be filled. */
export function wrap(node: WeightingExpression, operator: WeightingOperator): WeightingExpression {
  return { kind: "operation", operator, left: node, right: blank };
}

/** The paths of every blank, in reading order. */
export function blankPaths(tree: WeightingExpression, path: NodePath = rootPath): NodePath[] {
  if (tree.kind === "blank") {
    return [path];
  }
  if (tree.kind === "operation") {
    return [...blankPaths(tree.left, `${path}/left`), ...blankPaths(tree.right, `${path}/right`)];
  }
  return [];
}

export function size(tree: WeightingExpression): { nodes: number; depth: number } {
  if (tree.kind !== "operation") {
    return { nodes: 1, depth: 1 };
  }
  const left = size(tree.left);
  const right = size(tree.right);
  return { nodes: 1 + left.nodes + right.nodes, depth: 1 + Math.max(left.depth, right.depth) };
}

/** The characteristics an aggregate can use: numbers, yes/no and categories that are not retired. */
export function usableCharacteristics(characteristics: readonly Characteristic[]): Characteristic[] {
  return characteristics.filter(
    (characteristic) =>
      !characteristic.retired && (characteristic.type === "number" || characteristic.type === "boolean" || characteristic.type === "category"),
  );
}

/** The keys of every characteristic the function aggregates. */
export function referencedKeys(tree: WeightingExpression): Set<string> {
  const keys = new Set<string>();
  const visit = (node: WeightingExpression) => {
    if (node.kind === "aggregate" && node.characteristicKey !== undefined) {
      keys.add(node.characteristicKey);
    } else if (node.kind === "operation") {
      visit(node.left);
      visit(node.right);
    }
  };
  visit(tree);
  return keys;
}

/** A copy of the tree where every aggregate of `from` aggregates `to` instead. */
export function renameKey(tree: WeightingExpression, from: string, to: string): WeightingExpression {
  if (tree.kind === "aggregate" && tree.characteristicKey === from) {
    return { ...tree, characteristicKey: to };
  }
  if (tree.kind === "operation") {
    return { ...tree, left: renameKey(tree.left, from, to), right: renameKey(tree.right, from, to) };
  }
  return tree;
}

const precedence: Record<WeightingOperator, number> = { add: 1, subtract: 1, multiply: 2, divide: 2 };

/**
 * The function as one line of text, such as `Sum of Severity ÷ Population × 1000`, with the
 * parentheses its tree needs. Used where a fraction cannot be drawn, such as an accessible
 * name.
 */
export function formulaText(tree: WeightingExpression, labelOf: (key: string) => string): string {
  const text = (node: WeightingExpression): string => {
    switch (node.kind) {
      case "blank":
        return "?";
      case "number":
        return formatNumber(node.value);
      case "population":
        return "Population";
      case "aggregate":
        return aggregateText(node, labelOf);
      case "operation": {
        const left = needsParentheses(node, "left") ? `(${text(node.left)})` : text(node.left);
        const right = needsParentheses(node, "right") ? `(${text(node.right)})` : text(node.right);
        return `${left} ${operatorInfo[node.operator].symbol} ${right}`;
      }
    }
  };
  return text(tree);
}

export function aggregateText(node: Extract<WeightingExpression, { kind: "aggregate" }>, labelOf: (key: string) => string): string {
  if (node.function === "count") {
    return aggregateInfo.count.label;
  }
  const of = node.characteristicKey === undefined ? "?" : labelOf(node.characteristicKey);
  return `${aggregateInfo[node.function].label} of ${of}`;
}

/**
 * Whether a side of an operation needs parentheses in one-line text: when it binds more
 * loosely than the operation, or as loosely on the right of a subtraction or division.
 */
export function needsParentheses(node: Extract<WeightingExpression, { kind: "operation" }>, side: "left" | "right"): boolean {
  const child = node[side];
  if (child.kind !== "operation") {
    return false;
  }
  const outer = precedence[node.operator];
  const inner = precedence[child.operator];
  if (inner < outer) {
    return true;
  }
  return side === "right" && inner === outer && (node.operator === "subtract" || node.operator === "divide");
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en", { maximumFractionDigits: 6, useGrouping: false }).format(value);
}

function steps(path: NodePath): ("left" | "right")[] {
  if (path !== rootPath && !path.startsWith(`${rootPath}/`)) {
    throw new Error(`${path} is not a path in the weighting function.`);
  }
  return path
    .slice(rootPath.length)
    .split("/")
    .filter((step): step is "left" | "right" => step === "left" || step === "right");
}
