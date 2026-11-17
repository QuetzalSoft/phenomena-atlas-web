import type { Metadata } from "next";
import ui from "@/components/ui.module.css";
import { Notice } from "@/features/account/notice";
import { SignedInGate } from "@/features/account/signed-in-gate";
import { ReportForm } from "@/features/incident-report/report-form";
import { getViewer } from "@/lib/api/server";

export const metadata: Metadata = { title: "File a report" };

// Phenomena are published and archived at any time, and the page depends on who is asking.
export const dynamic = "force-dynamic";

export default async function NewReportPage({ searchParams }: { searchParams: Promise<{ phenomenon?: string }> }) {
  const { phenomenon } = await searchParams;
  const path = phenomenon ? `/reports/new?phenomenon=${encodeURIComponent(phenomenon)}` : "/reports/new";
  return (
    <main className={ui.page}>
      <p className={ui.eyebrow}>Incident reports</p>
      <h1 className={ui.title}>File a report</h1>
      <p className={ui.lead}>Tell the atlas that something happened. Reports are not reviewed: each one counts toward the map of its phenomenon.</p>
      <SignedInGate path={path} what="file a report">
        <Form />
      </SignedInGate>
    </main>
  );
}

async function Form() {
  const viewer = await getViewer();
  if (viewer.state !== "signed-in") {
    return null;
  }
  // Admins see every phenomenon, but only published ones accept reports.
  const result = await viewer.api.GET("/phenomena", { params: { query: { status: "published" } }, cache: "no-store" }).catch(() => undefined);
  if (!result?.data) {
    return <Notice title="Phenomena could not be loaded">The API did not return the phenomena. Reload the page to try again.</Notice>;
  }
  if (result.data.items.length === 0) {
    return <Notice title="Nothing to report yet">No phenomenon accepts reports yet. Come back once one is published.</Notice>;
  }
  return <ReportForm phenomena={result.data.items} />;
}
