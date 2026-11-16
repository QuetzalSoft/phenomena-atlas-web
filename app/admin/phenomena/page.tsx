import type { Metadata } from "next";
import ui from "@/components/ui.module.css";
import { AdminGate } from "@/features/account/admin-gate";
import { Notice } from "@/features/account/notice";
import { PhenomenaList } from "@/features/phenomenon/phenomena-list";
import { getViewer } from "@/lib/api/server";
import styles from "@/features/phenomenon/phenomenon.module.css";

export const metadata: Metadata = { title: "Phenomena" };

// Phenomena change at any time, and the page depends on who is asking.
export const dynamic = "force-dynamic";

export default function PhenomenaPage() {
  return (
    <main className={ui.page}>
      <p className={ui.eyebrow}>Administration</p>
      <h1 className={ui.title}>Phenomena</h1>
      <p className={ui.lead}>What the atlas maps. Each phenomenon defines what its reports record and how they colour the map.</p>
      <AdminGate path="/admin/phenomena" what="define phenomena">
        <Phenomena />
      </AdminGate>
    </main>
  );
}

async function Phenomena() {
  const viewer = await getViewer();
  if (viewer.state !== "signed-in") {
    return null;
  }
  const result = await viewer.api.GET("/phenomena", { cache: "no-store" }).catch(() => undefined);
  if (!result?.data) {
    return (
      <div className={styles.sections}>
        <Notice title="Phenomena could not be loaded">The API did not return the list of phenomena. Reload the page to try again.</Notice>
      </div>
    );
  }
  return <PhenomenaList phenomena={result.data.items} />;
}
