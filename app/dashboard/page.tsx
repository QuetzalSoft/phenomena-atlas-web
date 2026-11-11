import type { Metadata } from "next";
import { BrowserHealthCard } from "@/features/system-status/browser-health-card";
import { ServerHealthCard } from "@/features/system-status/server-health-card";
import ui from "@/components/ui.module.css";
import styles from "@/features/system-status/system-status.module.css";

export const metadata: Metadata = { title: "System status" };

// Every request checks the API again; a cached result would hide an outage.
export const dynamic = "force-dynamic";

export default function DashboardPage() {
  return (
    <main className={ui.page}>
      <p className={ui.eyebrow}>Phenomena Atlas</p>
      <h1 className={ui.title}>System status</h1>
      <p className={ui.lead}>
        Whether this site can reach the API, checked from both places the web client runs.
      </p>
      <div className={styles.grid}>
        <ServerHealthCard />
        <BrowserHealthCard />
      </div>
    </main>
  );
}
