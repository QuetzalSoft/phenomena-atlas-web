import { redirect } from "next/navigation";

/** Reports have no page of their own: a person's own are at /reports/mine. */
export default function ReportsPage() {
  redirect("/reports/mine");
}
