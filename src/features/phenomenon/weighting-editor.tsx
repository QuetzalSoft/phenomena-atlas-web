"use client";

import type { components } from "@quetzalsoft/phenomena-atlas-contract";
import { useId } from "react";
import { characteristicTypeInfo } from "./characteristic-draft";
import { Formula } from "./formula";
import { CloseIcon } from "./icons";
import { NumberField } from "./number-field";
import {
  aggregateFunctions,
  aggregateInfo,
  type AggregateFunction,
  blank,
  type NodePath,
  operatorInfo,
  operators,
  replaceAt,
  rootPath,
  usableCharacteristics,
  type WeightingExpression,
  type WeightingOperator,
  wrap,
} from "./weighting-tree";
import styles from "./phenomenon.module.css";

type Characteristic = components["schemas"]["Characteristic"];

interface WeightingEditorProps {
  tree: WeightingExpression;
  characteristics: Characteristic[];
  onChange: (tree: WeightingExpression) => void;
  /** Problems to show on the blocks they belong to, by path. */
  issues: ReadonlyMap<string, string>;
  /** The block the API refused, if any. */
  problemPath: string | undefined;
  disabled: boolean;
}

/**
 * The weighting function as nested blocks. Every empty part offers what can fill it, so the
 * function can be incomplete but never malformed.
 */
export function WeightingEditor({ tree, characteristics, onChange, issues, problemPath, disabled }: WeightingEditorProps) {
  const labelOf = (key: string) => characteristics.find((characteristic) => characteristic.key === key)?.label || key;
  const usable = usableCharacteristics(characteristics);
  const firstIssuePath = [...issues.keys()].find((path) => path.startsWith(rootPath));

  return (
    <div className={styles.functionEditor}>
      <Formula tree={tree} labelOf={labelOf} problemPath={problemPath ?? firstIssuePath} />
      <div className={styles.blocks} data-testid="weighting-blocks">
        <Block
          node={tree}
          path={rootPath}
          context={{ usable, labelOf, issues, problemPath, disabled, replace: (path, node) => onChange(replaceAt(tree, path, node)) }}
        />
      </div>
      {usable.length === 0 && (
        <p className={styles.hint}>
          Add a number, yes/no or category characteristic to aggregate it here. Until then, the function can count reports and use the population.
        </p>
      )}
    </div>
  );
}

interface BlockContext {
  usable: Characteristic[];
  labelOf: (key: string) => string;
  issues: ReadonlyMap<string, string>;
  problemPath: string | undefined;
  disabled: boolean;
  replace: (path: NodePath, node: WeightingExpression) => void;
}

/** A label for a position in the tree, so screen reader users know which part a control changes. */
function placeName(path: NodePath): string {
  if (path === rootPath) {
    return "the function";
  }
  const steps = path.slice(rootPath.length + 1).split("/");
  return `part ${steps.map((step) => (step === "left" ? "1" : "2")).join(".")}`;
}

function Block({ node, path, context }: { node: WeightingExpression; path: NodePath; context: BlockContext }) {
  const issue = context.issues.get(path);
  const problem = context.problemPath === path || context.problemPath?.startsWith(`${path}/characteristicKey`) || issue !== undefined;
  const issueId = useId();
  const place = placeName(path);

  const issueText = issue && (
    <p id={issueId} className={`${styles.errorText} ${styles.blockIssue}`}>
      {issue}
    </p>
  );

  if (node.kind === "blank") {
    return (
      <div className={styles.slot} data-problem={problem || undefined} data-testid="weighting-slot" data-path={path}>
        <Filler place={place} context={context} onPick={(picked) => context.replace(path, picked)} describedBy={issue ? issueId : undefined} />
        {issueText}
      </div>
    );
  }

  const tools = <BlockTools node={node} path={path} place={place} context={context} />;

  if (node.kind === "operation") {
    return (
      <div className={styles.group} data-problem={problem || undefined} data-testid="weighting-operation" data-path={path}>
        <div className={styles.groupHeader}>
          <select
            className={`${styles.input} ${styles.compact}`}
            aria-label={`Operation of ${place}`}
            value={node.operator}
            disabled={context.disabled}
            onChange={(event) => context.replace(path, { ...node, operator: event.target.value as WeightingOperator })}
          >
            {operators.map((operator) => (
              <option key={operator} value={operator}>
                {operatorInfo[operator].label} ({operatorInfo[operator].symbol})
              </option>
            ))}
          </select>
          {tools}
        </div>
        <div className={styles.operands}>
          <Block node={node.left} path={`${path}/left`} context={context} />
          <span className={styles.operatorSymbol} aria-hidden>
            {operatorInfo[node.operator].symbol}
          </span>
          <Block node={node.right} path={`${path}/right`} context={context} />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.block} data-problem={problem || undefined} data-testid="weighting-block" data-path={path}>
      <div className={styles.blockBody}>
        {node.kind === "number" && (
          <>
            <span className={styles.blockKind}>Number</span>
            <NumberField
              className={`${styles.input} ${styles.compact} ${styles.numberInput}`}
              aria-label={`Number in ${place}`}
              aria-describedby={issue ? issueId : undefined}
              aria-invalid={!Number.isFinite(node.value) || undefined}
              value={node.value}
              disabled={context.disabled}
              onValueChange={(value) => context.replace(path, { kind: "number", value: value ?? Number.NaN })}
            />
          </>
        )}
        {node.kind === "population" && (
          <>
            <span className={styles.blockKind}>Region</span>
            <span>Population</span>
          </>
        )}
        {node.kind === "aggregate" && (
          <>
            <span className={styles.blockKind}>Reports</span>
            <select
              className={`${styles.input} ${styles.compact}`}
              aria-label={`Aggregate of ${place}`}
              value={node.function}
              disabled={context.disabled}
              onChange={(event) => {
                const fn = event.target.value as AggregateFunction;
                context.replace(path, aggregate(fn, node.characteristicKey, context.usable));
              }}
            >
              {aggregateFunctions.map((fn) => (
                <option key={fn} value={fn}>{aggregateInfo[fn].label}</option>
              ))}
            </select>
            {aggregateInfo[node.function].needsCharacteristic && (
              <>
                <span>of</span>
                <select
                  className={`${styles.input} ${styles.compact}`}
                  aria-label={`Characteristic of ${place}`}
                  aria-invalid={problem || undefined}
                  aria-describedby={issue ? issueId : undefined}
                  value={node.characteristicKey ?? ""}
                  disabled={context.disabled}
                  onChange={(event) => context.replace(path, { ...node, characteristicKey: event.target.value })}
                >
                  {(node.characteristicKey === undefined || !context.usable.some((c) => c.key === node.characteristicKey)) && (
                    <option value={node.characteristicKey ?? ""} disabled>
                      {node.characteristicKey === undefined ? "Choose a characteristic" : context.labelOf(node.characteristicKey)}
                    </option>
                  )}
                  {context.usable.map((characteristic) => (
                    <option key={characteristic.key} value={characteristic.key}>
                      {characteristic.label || characteristic.key} ({characteristicTypeInfo[characteristic.type].label.toLowerCase()})
                    </option>
                  ))}
                </select>
              </>
            )}
          </>
        )}
      </div>
      {tools}
      {issueText}
    </div>
  );
}

/** A new aggregate, keeping the characteristic when the function still takes one. */
function aggregate(fn: AggregateFunction, key: string | undefined, usable: Characteristic[]): WeightingExpression {
  if (!aggregateInfo[fn].needsCharacteristic) {
    return { kind: "aggregate", function: fn };
  }
  const characteristicKey = key ?? usable[0]?.key;
  return { kind: "aggregate", function: fn, ...(characteristicKey !== undefined && { characteristicKey }) };
}

/** What an empty part can become. */
function Filler({ place, context, onPick, describedBy }: { place: string; context: BlockContext; onPick: (node: WeightingExpression) => void; describedBy: string | undefined }) {
  const pick = (choice: string) => {
    const [group, value] = choice.split(":") as [string, string];
    if (group === "value") {
      onPick(value === "number" ? { kind: "number", value: 1 } : { kind: "population" });
    } else if (group === "aggregate") {
      onPick(aggregate(value as AggregateFunction, undefined, context.usable));
    } else if (group === "operation") {
      onPick({ kind: "operation", operator: value as WeightingOperator, left: blank, right: blank });
    }
  };
  const noUsable = context.usable.length === 0;

  return (
    <select
      className={`${styles.input} ${styles.compact}`}
      aria-label={`Fill ${place}`}
      aria-describedby={describedBy}
      value=""
      disabled={context.disabled}
      onChange={(event) => pick(event.target.value)}
    >
      <option value="" disabled>
        Choose a value or an operation...
      </option>
      <optgroup label="Value">
        <option value="value:number">Number</option>
        <option value="value:population">Population of the region</option>
      </optgroup>
      <optgroup label="From the reports in the region">
        {aggregateFunctions.map((fn) => (
          <option key={fn} value={`aggregate:${fn}`} disabled={aggregateInfo[fn].needsCharacteristic && noUsable}>
            {aggregateInfo[fn].label}
            {aggregateInfo[fn].needsCharacteristic ? " of a characteristic" : ""}
          </option>
        ))}
      </optgroup>
      <optgroup label="Operation">
        {operators.map((operator) => (
          <option key={operator} value={`operation:${operator}`}>
            {operatorInfo[operator].label} ({operatorInfo[operator].symbol})
          </option>
        ))}
      </optgroup>
    </select>
  );
}

const combineLabel: Record<WeightingOperator, string> = {
  add: "+ Add to it",
  subtract: "− Subtract from it",
  multiply: "× Multiply it",
  divide: "÷ Divide it",
};

function BlockTools({ node, path, place, context }: { node: WeightingExpression; path: NodePath; place: string; context: BlockContext }) {
  return (
    <div className={styles.blockTools}>
      <select
        className={`${styles.input} ${styles.compact} ${styles.combine}`}
        aria-label={`Combine ${place} with an operation`}
        title="Combine with an operation"
        value=""
        disabled={context.disabled}
        onChange={(event) => context.replace(path, wrap(node, event.target.value as WeightingOperator))}
      >
        <option value="" disabled>
          Combine...
        </option>
        {operators.map((operator) => (
          <option key={operator} value={operator}>
            {combineLabel[operator]}
          </option>
        ))}
      </select>
      <button
        type="button"
        className={styles.iconButton}
        aria-label={`Clear ${place}`}
        title="Clear"
        disabled={context.disabled}
        onClick={() => context.replace(path, blank)}
      >
        <CloseIcon />
      </button>
    </div>
  );
}
