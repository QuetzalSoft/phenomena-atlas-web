import type { components } from "@quetzalsoft/phenomena-atlas-contract";
import { keyPattern } from "./characteristic-draft";
import { refreshIntervalIssue } from "./refresh-interval";
import { aggregateInfo, maxDepth, maxNodes, rootPath, size, type WeightingExpression } from "./weighting-tree";

/** What a change sends, but the revision it is based on. */
type Definition = Omit<components["schemas"]["PhenomenonChange"], "baseRevision">;
type Status = components["schemas"]["PhenomenonStatus"];

/** Something to fix before saving, at a path the API would use for the same problem. */
export interface Issue {
  path: string;
  message: string;
}

/**
 * The problems the API would refuse, found before asking it, so the admin sees them where
 * they are. A convenience only: the API checks everything again.
 */
export function findIssues(definition: Definition, status: Status): Issue[] {
  const issues: Issue[] = [];
  if (definition.name.trim() === "") {
    issues.push({ path: "/name", message: "Give the phenomenon a name." });
  }
  if (definition.refreshIntervalMinutes !== undefined) {
    const message = refreshIntervalIssue(definition.refreshIntervalMinutes);
    if (message) {
      issues.push({ path: "/refreshIntervalMinutes", message });
    }
  }

  const keys = new Set<string>();
  for (const [index, characteristic] of definition.characteristics.entries()) {
    const path = `/characteristics/${index}`;
    if (characteristic.label.trim() === "") {
      issues.push({ path: `${path}/label`, message: "Give the characteristic a label." });
    }
    if (!keyPattern.test(characteristic.key)) {
      issues.push({ path: `${path}/key`, message: "Use lowercase letters, digits and underscores, starting with a letter." });
    } else if (keys.has(characteristic.key)) {
      issues.push({ path: `${path}/key`, message: "Another characteristic already has this key." });
    }
    keys.add(characteristic.key);

    if (characteristic.type === "number" && characteristic.minimum !== undefined && characteristic.maximum !== undefined && characteristic.minimum > characteristic.maximum) {
      issues.push({ path: `${path}/maximum`, message: "The maximum is below the minimum." });
    }
    if (characteristic.type === "text" && !(Number.isInteger(characteristic.maxLength) && characteristic.maxLength >= 1 && characteristic.maxLength <= 5000)) {
      issues.push({ path: `${path}/maxLength`, message: "Use a whole number from 1 to 5000." });
    }
    if (characteristic.type === "category") {
      const optionKeys = new Set<string>();
      for (const [optionIndex, option] of characteristic.options.entries()) {
        const optionPath = `${path}/options/${optionIndex}`;
        if (option.label.trim() === "") {
          issues.push({ path: `${optionPath}/label`, message: "Give the option a label." });
        }
        if (!Number.isFinite(option.weight)) {
          issues.push({ path: `${optionPath}/weight`, message: "Give the option a weight." });
        }
        if (optionKeys.has(option.key)) {
          issues.push({ path: `${optionPath}/label`, message: "Another option already has this label." });
        }
        optionKeys.add(option.key);
      }
      if (characteristic.options.every((option) => option.retired)) {
        issues.push({ path: `${path}/options`, message: "Keep at least one option that is not retired." });
      }
    }
  }

  issues.push(...functionIssues(definition, status));
  return issues;
}

function functionIssues(definition: Definition, status: Status): Issue[] {
  const { nodes, depth } = size(definition.weightingFunction);
  if (nodes > maxNodes || depth > maxDepth) {
    return [{ path: rootPath, message: `The function is too large: at most ${maxNodes} parts and ${maxDepth} levels.` }];
  }
  const byKey = new Map(definition.characteristics.map((characteristic) => [characteristic.key, characteristic]));
  const issues: Issue[] = [];
  const visit = (node: WeightingExpression, path: string) => {
    if (node.kind === "blank" && status !== "draft") {
      issues.push({ path, message: "Fill in this part. A published phenomenon needs a complete function." });
    }
    if (node.kind === "number" && !Number.isFinite(node.value)) {
      issues.push({ path, message: "Enter a number." });
    }
    if (node.kind === "operation") {
      visit(node.left, `${path}/left`);
      visit(node.right, `${path}/right`);
    }
    if (node.kind === "aggregate" && aggregateInfo[node.function].needsCharacteristic) {
      const characteristic = node.characteristicKey === undefined ? undefined : byKey.get(node.characteristicKey);
      if (!characteristic) {
        issues.push({ path, message: "Choose a characteristic." });
      } else if (characteristic.retired) {
        issues.push({ path, message: `${characteristic.label || characteristic.key} is retired. Choose another characteristic.` });
      } else if (characteristic.type === "text" || characteristic.type === "date") {
        issues.push({ path, message: `${characteristic.label || characteristic.key} cannot be aggregated.` });
      }
    }
  };
  visit(definition.weightingFunction, rootPath);
  return issues;
}
