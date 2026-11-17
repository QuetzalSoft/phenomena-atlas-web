"use client";

import type { components } from "@quetzalsoft/phenomena-atlas-contract";
import { useInfiniteQuery } from "@tanstack/react-query";
import Link from "next/link";
import { parseAsInteger, useQueryState } from "nuqs";
import { Field } from "@/components/field";
import form from "@/components/form.module.css";
import ui from "@/components/ui.module.css";
import { call } from "@/lib/api/request";
import { useSessionApi } from "@/lib/api/use-session-api";
import { ReportCard } from "./report-card";
import { failureCopy } from "./report-copy";
import styles from "./incident-report.module.css";

type Phenomenon = components["schemas"]["Phenomenon"];

const pageSize = 20;

/** The reports the signed-in person filed, most recent first. */
export function MyReports({ phenomena }: { phenomena: Phenomenon[] }) {
  const api = useSessionApi();
  const [phenomenonId, setPhenomenonId] = useQueryState("phenomenon", parseAsInteger.withOptions({ history: "replace" }));
  const definitions = new Map(phenomena.map((phenomenon) => [phenomenon.id, phenomenon.characteristics]));

  const reports = useInfiniteQuery({
    queryKey: ["incident-reports", "mine", phenomenonId],
    queryFn: ({ pageParam }) =>
      call(() =>
        api.GET("/accounts/me/incident-reports", {
          params: { query: { limit: pageSize, ...(pageParam && { cursor: pageParam }), ...(phenomenonId !== null && { phenomenonId }) } },
        }),
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor,
  });
  const items = reports.data?.pages.flatMap((page) => page.items) ?? [];

  let content;
  if (reports.isPending) {
    content = <p className={styles.emptyState}>Loading your reports...</p>;
  } else if (reports.isError) {
    content = (
      <p className={`${styles.emptyState} ${form.errorText}`} role="alert">
        {failureCopy(reports.error, "Your reports could not be loaded. Reload the page to try again.")}
      </p>
    );
  } else if (items.length === 0) {
    content = (
      <div className={styles.card}>
        <p className={styles.emptyState}>
          {phenomenonId === null ? "You have not filed any reports yet." : "You have not filed any reports about this phenomenon."}{" "}
          <Link href={phenomenonId === null ? "/reports/new" : `/reports/new?phenomenon=${phenomenonId}`}>File a report</Link>
        </p>
      </div>
    );
  } else {
    content = (
      <>
        <ol className={styles.reports} data-testid="my-reports">
          {items.map((report) => (
            <ReportCard key={report.id} report={report} characteristics={definitions.get(report.phenomenonId)} />
          ))}
        </ol>
        {reports.hasNextPage && (
          <div className={styles.more}>
            <button type="button" className={ui.button} onClick={() => void reports.fetchNextPage()} disabled={reports.isFetchingNextPage}>
              {reports.isFetchingNextPage ? "Loading..." : "Show more"}
            </button>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <div className={styles.toolbar}>
        <Field label="Phenomenon" className={styles.filter}>
          {(field) => (
            <select
              {...field}
              className={form.input}
              value={phenomenonId ?? ""}
              onChange={(event) => void setPhenomenonId(event.target.value === "" ? null : Number(event.target.value))}
            >
              <option value="">All phenomena</option>
              {phenomena.map((phenomenon) => (
                <option key={phenomenon.id} value={phenomenon.id}>
                  {phenomenon.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Link href={phenomenonId === null ? "/reports/new" : `/reports/new?phenomenon=${phenomenonId}`} className={`${ui.button} ${form.primary}`}>
          File a report
        </Link>
      </div>
      <div className={styles.sections}>{content}</div>
    </>
  );
}
