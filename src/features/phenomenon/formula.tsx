import type { ReactNode } from "react";
import { aggregateText, formatNumber, formulaText, needsParentheses, type NodePath, rootPath, type WeightingExpression } from "./weighting-tree";
import styles from "./phenomenon.module.css";

/**
 * The weighting function as a formula, with each division drawn as a fraction. Blanks show as
 * empty boxes; the one at `problemPath`, if any, in the error colour.
 */
export function Formula({ tree, labelOf, problemPath }: { tree: WeightingExpression; labelOf: (key: string) => string; problemPath?: string | undefined }) {
  const render = (node: WeightingExpression, path: NodePath): ReactNode => {
    switch (node.kind) {
      case "blank":
        return <span className={styles.formulaBlank} data-problem={problemPath === path || undefined}>?</span>;
      case "number":
        return <span>{formatNumber(node.value)}</span>;
      case "population":
        return <span className={styles.term}>Population</span>;
      case "aggregate":
        return <span className={styles.term}>{aggregateText(node, labelOf)}</span>;
      case "operation": {
        const left = render(node.left, `${path}/left`);
        const right = render(node.right, `${path}/right`);
        if (node.operator === "divide") {
          return (
            <span className={styles.fraction}>
              <span>{left}</span>
              <span>{right}</span>
            </span>
          );
        }
        const symbol = { add: "+", subtract: "−", multiply: "×" }[node.operator];
        return (
          <>
            {needsParentheses(node, "left") ? <>({left})</> : left}
            <span>{symbol}</span>
            {needsParentheses(node, "right") && node.right.kind === "operation" && node.right.operator !== "divide" ? <>({right})</> : right}
          </>
        );
      }
    }
  };

  return (
    <div className={styles.formula} role="img" aria-label={`Index = ${formulaText(tree, labelOf)}`} data-testid="formula">
      <span className={styles.formulaLine} aria-hidden>
        <span>Index =</span>
        {render(tree, rootPath)}
      </span>
    </div>
  );
}
