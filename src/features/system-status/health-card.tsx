import type { ReactNode } from "react";
import type { HealthCheck } from "./check-health";
import { CheckedAt } from "./checked-at";
import ui from "@/components/ui.module.css";
import styles from "./system-status.module.css";

type Status = "pending" | HealthCheck["outcome"];

const statusLabel: Record<Status, string> = {
  pending: "Checking",
  ok: "Operational",
  failed: "Error",
  unreachable: "Unreachable",
};

interface HealthCardProps {
  title: string;
  description: ReactNode;
  check: HealthCheck | undefined;
  action?: ReactNode;
  testId: string;
}

export function HealthCard({ title, description, check, action, testId }: HealthCardProps) {
  const status: Status = check?.outcome ?? "pending";

  return (
    <section className={ui.card} aria-labelledby={`${testId}-title`} data-testid={testId}>
      <header className={styles.cardHeader}>
        <h2 id={`${testId}-title`} className={styles.cardTitle}>{title}</h2>
        <span className={styles.status} data-status={status} data-testid={`${testId}-status`}>
          <span className={styles.dot} aria-hidden />
          {statusLabel[status]}
        </span>
      </header>
      <p className={styles.description}>{description}</p>

      <dl className={styles.facts}>
        <div>
          <dt>Target</dt>
          <dd className={styles.mono}>{check ? (check.target ?? "Not configured") : "-"}</dd>
        </div>
        <div>
          <dt>Latency</dt>
          <dd>{check && "latencyMs" in check ? `${check.latencyMs} ms` : "-"}</dd>
        </div>
        <div>
          <dt>Checked at</dt>
          <dd>{check ? <CheckedAt iso={check.checkedAt} /> : "-"}</dd>
        </div>
      </dl>

      {check && check.outcome !== "ok" && (
        <p className={styles.problem} role="status">
          {problemCopy(check)}
        </p>
      )}

      {action && <footer className={styles.cardFooter}>{action}</footer>}
    </section>
  );
}

function problemCopy(check: Exclude<HealthCheck, { outcome: "ok" }>): ReactNode {
  if (check.outcome === "unreachable") {
    return "The API did not answer. Check that it is running and that the target address is right.";
  }
  return (
    <>
      The API answered with HTTP {check.httpStatus}
      {check.code && (
        <>
          {" "}and error code <code>{check.code}</code>
        </>
      )}
      .
    </>
  );
}
