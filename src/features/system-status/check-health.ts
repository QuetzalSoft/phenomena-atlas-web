import { api, apiBaseUrl, errorCode } from "@/lib/api";

const timeoutMs = 5000;

interface CheckBase {
  /** The address this side used to reach the API. */
  target: string | undefined;
  checkedAt: string;
}

export type HealthCheck = CheckBase &
  (
    | { outcome: "ok"; latencyMs: number }
    | { outcome: "failed"; latencyMs: number; httpStatus: number; code: string | undefined }
    | { outcome: "unreachable" }
  );

/** Calls the API's liveness probe and reports what happened. Never throws. */
export async function checkHealth(): Promise<HealthCheck> {
  const checkedAt = new Date().toISOString();
  const started = performance.now();
  const base = { target: apiBaseUrl, checkedAt };

  try {
    const { data, error, response } = await api.GET("/health", {
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    const latencyMs = Math.round(performance.now() - started);
    if (data?.status === "ok") {
      return { ...base, outcome: "ok", latencyMs };
    }
    return { ...base, outcome: "failed", latencyMs, httpStatus: response.status, code: errorCode(error) };
  } catch {
    return { ...base, outcome: "unreachable" };
  }
}
