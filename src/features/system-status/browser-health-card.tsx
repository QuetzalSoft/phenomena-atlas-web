"use client";

import { useQuery } from "@tanstack/react-query";
import { checkHealth } from "./check-health";
import { HealthCard } from "./health-card";
import ui from "@/components/ui.module.css";

const refreshMs = 10_000;

/** Checks the API from the browser, the path Client Components use, across CORS. */
export function BrowserHealthCard() {
  const { data, isFetching, refetch } = useQuery({
    queryKey: ["system-status", "browser-health"],
    queryFn: checkHealth,
    refetchInterval: refreshMs,
  });

  return (
    <HealthCard
      testId="browser-health"
      title="From your browser"
      description={<>Client Components reach the API at <code>NEXT_PUBLIC_API_URL</code>. Checked every {refreshMs / 1000} seconds.</>}
      check={data}
      action={
        <button type="button" className={ui.button} onClick={() => void refetch()} disabled={isFetching}>
          {isFetching ? "Checking..." : "Check again"}
        </button>
      }
    />
  );
}
