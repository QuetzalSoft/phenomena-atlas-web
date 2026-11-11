import type { Metadata } from "next";
import ui from "@/components/ui.module.css";
import { AdminGate } from "@/features/region/admin-gate";
import { PartitionHistory } from "@/features/region/partition-history";
import styles from "@/features/region/regions.module.css";

export const metadata: Metadata = { title: "Region history" };

// The page depends on who is asking.
export const dynamic = "force-dynamic";

export default function RegionHistoryPage() {
  return (
    <main className={styles.page} data-page-width="wide">
      <div className={styles.header}>
        <div>
          <p className={ui.eyebrow}>Administration</p>
          <h1 className={ui.title}>Region history</h1>
        </div>
      </div>
      <AdminGate path="/admin/regions/history" what="see the history of the regions">
        <PartitionHistory />
      </AdminGate>
    </main>
  );
}
