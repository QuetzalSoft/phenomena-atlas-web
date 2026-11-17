"use client";

import type { components } from "@quetzalsoft/phenomena-atlas-contract";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { parseAsInteger, useQueryState } from "nuqs";
import { useMemo, useState } from "react";
import { Field } from "@/components/field";
import form from "@/components/form.module.css";
import ui from "@/components/ui.module.css";
import { SignInLink } from "@/features/account/sign-in-link";
import { RegionPreview, RegionSelect, useRegions } from "@/features/region/region-picker";
import { call, RequestFailed } from "@/lib/api/request";
import { useSessionApi } from "@/lib/api/use-session-api";
import { CharacteristicInput } from "./characteristic-input";
import { ReportCard } from "./report-card";
import { failureCopy } from "./report-copy";
import { activeCharacteristics, bodyOf, emptyDraft, findIssues, type ReportDraft, today, type ValueDraft } from "./report-draft";
import styles from "./incident-report.module.css";

type Phenomenon = components["schemas"]["Phenomenon"];
type Report = components["schemas"]["IncidentReport"];

/** Anyone signed in picks a published phenomenon and files a report about it. */
export function ReportForm({ phenomena }: { phenomena: Phenomenon[] }) {
  const [phenomenonId, setPhenomenonId] = useQueryState("phenomenon", parseAsInteger.withOptions({ history: "replace" }));
  const phenomenon = phenomena.find((candidate) => candidate.id === phenomenonId);

  return (
    <div className={styles.sections}>
      <section className={styles.card} aria-labelledby="phenomenon-title">
        <h2 id="phenomenon-title" className={styles.cardTitle}>Phenomenon</h2>
        <Field label="What do you want to report?" hint={phenomenon?.description || undefined}>
          {(field) => (
            <select
              {...field}
              className={form.input}
              value={phenomenon?.id ?? ""}
              onChange={(event) => void setPhenomenonId(event.target.value === "" ? null : Number(event.target.value))}
              data-testid="phenomenon-select"
            >
              <option value="">Choose a phenomenon</option>
              {phenomena.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name}
                </option>
              ))}
            </select>
          )}
        </Field>
      </section>
      {/* A new form for each phenomenon: its characteristics are a different set of fields. */}
      {phenomenon && <ReportFields key={phenomenon.id} phenomenon={phenomenon} />}
    </div>
  );
}

function ReportFields({ phenomenon }: { phenomenon: Phenomenon }) {
  const api = useSessionApi();
  const { municipalities, partition } = useRegions();
  const [draft, setDraft] = useState<ReportDraft>(emptyDraft);
  const [filed, setFiled] = useState<Report>();
  // Problems are only pointed out once the person tries to file, not while they type.
  const [triedToFile, setTriedToFile] = useState(false);
  const [refusal, setRefusal] = useState<{ text: string; path: string | undefined; expired: boolean }>();

  const characteristics = useMemo(() => activeCharacteristics(phenomenon.characteristics), [phenomenon]);
  const maxDate = today();
  const allIssues = useMemo(() => findIssues(draft, phenomenon.characteristics, maxDate), [draft, phenomenon, maxDate]);
  const issues = triedToFile ? allIssues : new Map<string, string>();
  const issueAt = (path: string) => issues.get(path) ?? (refusal?.path === path ? refusal.text : undefined);

  const change = (patch: Partial<ReportDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setRefusal(undefined);
  };
  const changeValue = (key: string, value: ValueDraft) => change({ values: { ...draft.values, [key]: value } });

  const file = useMutation({
    mutationFn: () =>
      call(() =>
        api.POST("/phenomena/{phenomenonId}/incident-reports", {
          params: { path: { phenomenonId: phenomenon.id } },
          body: bodyOf(draft, phenomenon.characteristics),
        }),
      ),
    onMutate: () => setRefusal(undefined),
    onSuccess: (report) => {
      setFiled(report);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    onError: (error) => {
      const failure = error instanceof RequestFailed ? error : new RequestFailed(undefined, undefined);
      const path = failure.details?.path;
      setRefusal({ text: failureCopy(failure, "The report could not be filed. Try again."), path: typeof path === "string" ? path : undefined, expired: failure.status === 401 });
    },
  });

  const tryToFile = () => {
    setTriedToFile(true);
    if (allIssues.size === 0) {
      file.mutate();
    }
  };

  const startAnother = () => {
    setDraft(emptyDraft());
    setTriedToFile(false);
    setFiled(undefined);
    file.reset();
  };

  if (filed) {
    return (
      <section className={`${styles.card} ${styles.success}`} aria-labelledby="filed-title" data-testid="report-filed">
        <h2 id="filed-title" className={styles.successTitle}>
          <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
            <circle cx="11" cy="11" r="10" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <path d="m6.5 11.5 3 3 6-6.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Report filed
        </h2>
        <p className={styles.muted}>Thank you. It counts toward the map of {phenomenon.name} from now on. Reports cannot be edited or withdrawn.</p>
        <ReportCard report={filed} characteristics={phenomenon.characteristics} as="article" />
        <div className={styles.actions}>
          <button type="button" className={`${ui.button} ${form.primary}`} onClick={startAnother}>
            File another report
          </button>
          <Link href="/reports/mine" className={ui.button}>
            See my reports
          </Link>
        </div>
      </section>
    );
  }

  const busy = file.isPending;
  let regionControl;
  if (partition.data) {
    regionControl = (
      <>
        <Field label="Region" hint="Search by the name of the neighbourhood or area." issue={issueAt("/regionId")}>
          {(field) => (
            <RegionSelect
              {...field}
              partition={partition.data}
              municipalities={municipalities.data}
              value={draft.regionId}
              onChange={(regionId) => change({ regionId })}
              invalid={!!issueAt("/regionId")}
              disabled={busy}
            />
          )}
        </Field>
        <RegionPreview partition={partition.data} municipalities={municipalities.data} regionId={draft.regionId} />
      </>
    );
  } else if (partition.isError) {
    regionControl = (
      <p className={form.errorText} role="alert">
        The regions could not be loaded. Reload the page to try again.
      </p>
    );
  } else {
    regionControl = <p className={styles.muted}>Loading the regions...</p>;
  }

  return (
    <form
      className={styles.form}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        tryToFile();
      }}
      aria-label={`Report about ${phenomenon.name}`}
    >
      <section className={styles.card} aria-labelledby="where-title">
        <h2 id="where-title" className={styles.cardTitle}>Where and when</h2>
        <p className={styles.privacy}>
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
            <path d="M8 1.5 2.5 3.8v3.6c0 3.3 2.3 6.1 5.5 7.1 3.2-1 5.5-3.8 5.5-7.1V3.8L8 1.5Z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
          </svg>
          <span>To keep you anonymous, a report records the region where it happened, never an exact place. Analysts read reports without the name of who filed them.</span>
        </p>
        {regionControl}
        <div className={styles.grid}>
          <Field label="Day it happened" issue={issueAt("/occurredOn")}>
            {(field) => (
              <input
                {...field}
                type="date"
                className={form.input}
                value={draft.occurredOn}
                max={maxDate}
                aria-invalid={!!issueAt("/occurredOn") || undefined}
                disabled={busy}
                onChange={(event) => change({ occurredOn: event.target.value })}
              />
            )}
          </Field>
        </div>
      </section>

      <section className={styles.card} aria-labelledby="what-title">
        <h2 id="what-title" className={styles.cardTitle}>What happened</h2>
        <Field
          label={
            <>
              Description<span className={styles.optional}> (optional)</span>
            </>
          }
          hint="In your own words. Leave out names and anything else that identifies a person."
          issue={issueAt("/description")}
        >
          {(field) => (
            <textarea
              {...field}
              className={form.input}
              value={draft.description}
              maxLength={2000}
              rows={4}
              aria-invalid={!!issueAt("/description") || undefined}
              disabled={busy}
              onChange={(event) => change({ description: event.target.value })}
            />
          )}
        </Field>
        {characteristics.length > 0 && (
          <div className={styles.grid} data-testid="characteristic-fields">
            {characteristics.map((characteristic) => (
              <CharacteristicInput
                key={characteristic.key}
                characteristic={characteristic}
                value={draft.values[characteristic.key]}
                onChange={(value) => changeValue(characteristic.key, value)}
                issue={issueAt(`/values/${characteristic.key}`)}
                maxDate={maxDate}
                disabled={busy}
              />
            ))}
          </div>
        )}
      </section>

      <div className={styles.submitBar}>
        {refusal ? (
          <div className={styles.message} role="alert" data-testid="report-message">
            <p>{refusal.text}</p>
            {refusal.expired && <SignInLink label="Sign in again" />}
          </div>
        ) : (
          <p>
            {issues.size > 0
              ? `${issues.size === 1 ? "One thing needs" : `${issues.size} things need`} fixing before filing.`
              : "Once filed, a report cannot be edited or withdrawn."}
          </p>
        )}
        <button type="submit" className={`${ui.button} ${form.primary}`} disabled={busy || issues.size > 0}>
          {busy ? "Filing..." : "File report"}
        </button>
      </div>
    </form>
  );
}
