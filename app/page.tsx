import Link from "next/link";
import ui from "@/components/ui.module.css";

export default function HomePage() {
  return (
    <main className={ui.page}>
      <p className={ui.eyebrow}>Phenomena Atlas</p>
      <h1 className={ui.title}>Nothing to explore yet</h1>
      <p className={ui.lead}>
        The atlas has no phenomena until the domain is defined. Meanwhile, the{" "}
        <Link href="/dashboard">system status</Link> page shows whether this site can reach the API.
      </p>
    </main>
  );
}
