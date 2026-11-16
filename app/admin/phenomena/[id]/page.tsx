import type { Metadata } from "next";
import ui from "@/components/ui.module.css";
import { AdminGate } from "@/features/account/admin-gate";
import { Notice } from "@/features/account/notice";
import { PhenomenonEditor } from "@/features/phenomenon/phenomenon-editor";
import { getViewer } from "@/lib/api/server";

export const metadata: Metadata = { title: "Phenomenon" };

// The definition changes at any time, and the page depends on who is asking.
export const dynamic = "force-dynamic";

export default async function PhenomenonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main className={ui.page}>
      <AdminGate path={`/admin/phenomena/${id}`} what="define phenomena">
        <Editor id={id} />
      </AdminGate>
    </main>
  );
}

async function Editor({ id }: { id: string }) {
  const viewer = await getViewer();
  if (viewer.state !== "signed-in") {
    return null;
  }
  const phenomenonId = Number(id);
  const notFound = <Notice title="There is no such phenomenon">It may have been deleted. Go back to the list of phenomena.</Notice>;
  if (!Number.isInteger(phenomenonId) || phenomenonId < 1) {
    return notFound;
  }
  const result = await viewer.api
    .GET("/phenomena/{phenomenonId}", { params: { path: { phenomenonId } }, cache: "no-store" })
    .catch(() => undefined);
  if (result?.data) {
    return <PhenomenonEditor initial={result.data} />;
  }
  if (result?.response.status === 404) {
    return notFound;
  }
  return <Notice title="The phenomenon could not be loaded">The API did not return it. Reload the page to try again.</Notice>;
}
