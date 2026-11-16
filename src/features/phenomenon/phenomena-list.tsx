"use client";

import type { components } from "@quetzalsoft/phenomena-atlas-contract";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import ui from "@/components/ui.module.css";
import { call } from "@/lib/api/request";
import { useSessionApi } from "@/lib/api/use-session-api";
import { failureCopy } from "./phenomenon-copy";
import { StatusBadge } from "./status-badge";
import styles from "./phenomenon.module.css";

type Phenomenon = components["schemas"]["Phenomenon"];

/** Every phenomenon, by name, and a way to start a new one. */
export function PhenomenaList({ phenomena }: { phenomena: Phenomenon[] }) {
  const api = useSessionApi();
  const router = useRouter();
  const [name, setName] = useState("");

  const create = useMutation({
    mutationFn: () =>
      call(() =>
        api.POST("/phenomena", {
          body: { name: name.trim(), description: "", characteristics: [], weightingFunction: { kind: "blank" } },
        }),
      ),
    onSuccess: (created) => router.push(`/admin/phenomena/${created.id}`),
  });

  return (
    <div className={styles.sections}>
      <section className={styles.card} aria-labelledby="new-phenomenon-title">
        <h2 id="new-phenomenon-title" className={styles.cardTitle}>New phenomenon</h2>
        <form
          className={styles.createForm}
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate();
          }}
        >
          <label className={styles.field}>
            Name
            <input
              className={styles.input}
              value={name}
              maxLength={200}
              placeholder="Such as Gender violence"
              disabled={create.isPending}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <button type="submit" className={`${ui.button} ${styles.primary}`} disabled={create.isPending || name.trim() === ""}>
            {create.isPending ? "Creating..." : "Create draft"}
          </button>
        </form>
        <p className={styles.hint}>It starts as a draft that only admins can see. Define its characteristics and weighting function, then publish it.</p>
        {create.isError && (
          <p className={styles.errorText} role="alert">
            {failureCopy(create.error, "The phenomenon could not be created. Try again.")}
          </p>
        )}
      </section>

      <section aria-label="Phenomena" className={styles.tableCard}>
        <div className={styles.tableScroll}>
          <table className={styles.table} data-testid="phenomena-table">
            <thead>
              <tr>
                <th scope="col">Phenomenon</th>
                <th scope="col" className={styles.shrink}>Status</th>
                <th scope="col" className={styles.numeric}>Characteristics</th>
                <th scope="col" className={styles.numeric}>Updated</th>
              </tr>
            </thead>
            <tbody>
              {phenomena.length === 0 ? (
                <tr>
                  <td colSpan={4} className={styles.emptyState}>No phenomena yet. Create the first one above.</td>
                </tr>
              ) : (
                phenomena.map((phenomenon) => (
                  <tr key={phenomenon.id} data-testid="phenomenon-row">
                    <td>
                      <Link href={`/admin/phenomena/${phenomenon.id}`}>{phenomenon.name}</Link>
                    </td>
                    <td className={styles.shrink}>
                      <StatusBadge status={phenomenon.status} />
                    </td>
                    <td className={styles.numeric}>{phenomenon.characteristics.filter((characteristic) => !characteristic.retired).length}</td>
                    <td className={styles.numeric}>
                      <time dateTime={phenomenon.updatedAt}>{dateFormat.format(new Date(phenomenon.updatedAt))}</time>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" });
