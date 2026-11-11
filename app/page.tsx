import Link from "next/link";
import styles from "@/features/system-status/system-status.module.css";

export default function HomePage() {
  return (
    <main className={styles.page}>
      <p className={styles.eyebrow}>Phenomena Atlas</p>
      <h1 className={styles.title}>Nothing to explore yet</h1>
      <p className={styles.lead}>
        The atlas has no phenomena until the domain is defined. Meanwhile, the{" "}
        <Link href="/dashboard">system status</Link> page shows whether this site can reach the API.
      </p>
    </main>
  );
}
