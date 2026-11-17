import type { Metadata } from "next";
import ui from "@/components/ui.module.css";
import { SignedInGate } from "@/features/account/signed-in-gate";
import { MyReports } from "@/features/incident-report/my-reports";
import { getViewer } from "@/lib/api/server";

export const metadata: Metadata = { title: "My reports" };

// The list depends on who is asking.
export const dynamic = "force-dynamic";

export default function MyReportsPage() {
  return (
    <main className={ui.page}>
      <p className={ui.eyebrow}>Incident reports</p>
      <h1 className={ui.title}>My reports</h1>
      <p className={ui.lead}>The reports you filed. Only you can see this list; analysts read reports without the name of who filed them.</p>
      <SignedInGate path="/reports/mine" what="see your reports">
        <Reports />
      </SignedInGate>
    </main>
  );
}

async function Reports() {
  const viewer = await getViewer();
  if (viewer.state !== "signed-in") {
    return null;
  }
  // Labels the values of reports about published phenomena. Without it, values show under their keys.
  const phenomena = await viewer.api.GET("/phenomena", { params: { query: { status: "published" } }, cache: "no-store" }).catch(() => undefined);
  return <MyReports phenomena={phenomena?.data?.items ?? []} />;
}
