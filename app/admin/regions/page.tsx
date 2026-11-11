import type { Metadata } from "next";
import ui from "@/components/ui.module.css";
import { AdminGate } from "@/features/region/admin-gate";
import { RegionEditor } from "@/features/region/region-editor";
import styles from "@/features/region/regions.module.css";

export const metadata: Metadata = { title: "Regions" };

// The page depends on who is asking.
export const dynamic = "force-dynamic";

export default function RegionsPage() {
  return (
    <main className={styles.page} data-page-width="wide">
      <div className={styles.header}>
        <div>
          <p className={ui.eyebrow}>Administration</p>
          <h1 className={ui.title}>Regions</h1>
        </div>
      </div>
      <AdminGate path="/admin/regions" what="change the regions">
        <RegionEditor />
      </AdminGate>
    </main>
  );
}
