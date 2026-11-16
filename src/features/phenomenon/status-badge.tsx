import type { components } from "@quetzalsoft/phenomena-atlas-contract";
import { statusInfo } from "./phenomenon-copy";
import styles from "./phenomenon.module.css";

export function StatusBadge({ status }: { status: components["schemas"]["PhenomenonStatus"] }) {
  return (
    <span className={styles.status} data-status={status} data-testid="phenomenon-status">
      {statusInfo[status].label}
    </span>
  );
}
