import type { components } from "@quetzalsoft/phenomena-atlas-contract";
import { displayValue } from "./report-draft";
import styles from "./incident-report.module.css";

type Report = components["schemas"]["IncidentReport"];
type Characteristic = components["schemas"]["Characteristic"];

const dayFormat = new Intl.DateTimeFormat("en", { dateStyle: "long", timeZone: "UTC" });
const filedFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Mexico_City" });

/** A YYYY-MM-DD day as people read it. Formatted in UTC, where the date string is midnight. */
export const formatDay = (day: string) => dayFormat.format(new Date(`${day}T00:00:00Z`));

/**
 * A filed report. `characteristics` labels its values when the phenomenon's definition is at
 * hand; otherwise each value shows under its key.
 */
export function ReportCard({ report, characteristics, as: Tag = "li" }: { report: Report; characteristics: readonly Characteristic[] | undefined; as?: "li" | "article" }) {
  const byKey = new Map(characteristics?.map((characteristic) => [characteristic.key, characteristic]));
  const values = Object.entries(report.values);
  return (
    <Tag className={styles.report} data-testid="report">
      <div className={styles.reportHeader}>
        <h3 className={styles.reportTitle}>{report.phenomenonName}</h3>
        <span className={styles.reportMeta}>Filed {filedFormat.format(new Date(report.createdAt))}</span>
      </div>
      <span className={styles.reportMeta}>
        {report.regionName} · {formatDay(report.occurredOn)}
      </span>
      {report.description && <p className={styles.reportDescription}>{report.description}</p>}
      {values.length > 0 && (
        <dl className={styles.values}>
          {values.map(([key, value]) => {
            const characteristic = byKey.get(key);
            return (
              <div key={key}>
                <dt>{characteristic?.label ?? key}</dt>
                <dd>{displayValue(characteristic, value)}</dd>
              </div>
            );
          })}
        </dl>
      )}
    </Tag>
  );
}
