import { checkHealth } from "./check-health";
import { HealthCard } from "./health-card";

/** Checks the API from the Next.js server, the path Server Components use. */
export async function ServerHealthCard() {
  const check = await checkHealth();

  return (
    <HealthCard
      testId="server-health"
      title="From the web server"
      description={<>Server Components reach the API at <code>API_URL</code>. Reload the page to check again.</>}
      check={check}
    />
  );
}
