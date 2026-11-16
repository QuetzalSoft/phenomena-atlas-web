"use client";

import type { components } from "@quetzalsoft/phenomena-atlas-contract";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import ui from "@/components/ui.module.css";
import { SignInLink } from "@/features/account/sign-in-link";
import { call, RequestFailed } from "@/lib/api/request";
import { useSessionApi } from "@/lib/api/use-session-api";
import { newCharacteristic } from "./characteristic-draft";
import { type CharacteristicItem, CharacteristicsEditor } from "./characteristics-editor";
import { findIssues } from "./definition-issues";
import { failureCopy, statusInfo } from "./phenomenon-copy";
import { StatusBadge } from "./status-badge";
import { WeightingEditor } from "./weighting-editor";
import { blankPaths, renameKey, type WeightingExpression } from "./weighting-tree";
import styles from "./phenomenon.module.css";

type Phenomenon = components["schemas"]["Phenomenon"];
type Definition = components["schemas"]["PhenomenonDefinition"];
type Status = components["schemas"]["PhenomenonStatus"];

interface Draft {
  name: string;
  description: string;
  items: CharacteristicItem[];
  weightingFunction: WeightingExpression;
}

interface Message {
  tone: "ok" | "error";
  text: string;
  action?: ReactNode;
}

let uidCounter = 0;
const nextUid = () => `c${(uidCounter += 1)}`;

function draftOf(phenomenon: Phenomenon): Draft {
  return {
    name: phenomenon.name,
    description: phenomenon.description,
    items: phenomenon.characteristics.map((characteristic) => ({ uid: nextUid(), value: characteristic, saved: characteristic, keyEdited: false })),
    weightingFunction: phenomenon.weightingFunction,
  };
}

function definitionOf(draft: Draft): Definition {
  return {
    name: draft.name.trim(),
    description: draft.description.trim(),
    characteristics: draft.items.map((item) => item.value),
    weightingFunction: draft.weightingFunction,
  };
}

function definitionOfSaved(phenomenon: Phenomenon): Definition {
  return { name: phenomenon.name, description: phenomenon.description, characteristics: phenomenon.characteristics, weightingFunction: phenomenon.weightingFunction };
}

/** An admin defines one phenomenon: its details, its characteristics and its weighting function. */
export function PhenomenonEditor({ initial }: { initial: Phenomenon }) {
  const api = useSessionApi();
  const router = useRouter();
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(() => draftOf(initial));
  const [message, setMessage] = useState<Message>();
  const [problemPath, setProblemPath] = useState<string>();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // Empty fields are only pointed out once the admin tries to save, not while they type.
  const [triedToSave, setTriedToSave] = useState(false);

  const definition = useMemo(() => definitionOf(draft), [draft]);
  const dirty = JSON.stringify(definition) !== JSON.stringify(definitionOfSaved(saved));
  const allIssues = useMemo(() => findIssues(definition, saved.status), [definition, saved.status]);
  // Problems in the function follow from other edits, such as retiring a characteristic it
  // uses, so they show straight away.
  const issues = useMemo(
    () => new Map(allIssues.filter((issue) => triedToSave || issue.path.startsWith("/weightingFunction")).map((issue) => [issue.path, issue.message])),
    [allIssues, triedToSave],
  );
  const nameIssue = issues.get("/name");

  const change = (patch: Partial<Draft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setProblemPath(undefined);
    if (message?.tone === "ok") {
      setMessage(undefined);
    }
  };

  const refused = (error: unknown, fallback: string) => {
    const failure = error instanceof RequestFailed ? error : new RequestFailed(undefined, undefined);
    const path = failure.details?.path;
    setProblemPath(typeof path === "string" ? path : undefined);
    setMessage({
      tone: "error",
      text: failureCopy(failure, fallback),
      ...(failure.code === "phenomenon_revision_conflict" && {
        action: (
          <button type="button" className={ui.button} onClick={() => void loadLatest()}>
            Load their version
          </button>
        ),
      }),
      ...(failure.status === 401 && { action: <SignInLink label="Sign in again" /> }),
    });
  };

  const loadLatest = async () => {
    const latest = await call(() => api.GET("/phenomena/{phenomenonId}", { params: { path: { phenomenonId: saved.id } } })).catch(() => undefined);
    if (!latest) {
      setMessage({ tone: "error", text: "The latest version could not be loaded. Reload the page." });
      return;
    }
    setSaved(latest);
    setDraft(draftOf(latest));
    setProblemPath(undefined);
    setMessage({ tone: "ok", text: "Showing the latest version." });
  };

  const save = useMutation({
    mutationFn: () =>
      call(() => api.PUT("/phenomena/{phenomenonId}", { params: { path: { phenomenonId: saved.id } }, body: { baseRevision: saved.revision, ...definition } })),
    onMutate: () => setMessage(undefined),
    onSuccess: (updated) => {
      setSaved(updated);
      setDraft(draftOf(updated));
      setTriedToSave(false);
      setMessage({ tone: "ok", text: "Saved." });
    },
    onError: (error) => refused(error, "The phenomenon could not be saved. Try again."),
  });

  const changeStatus = useMutation({
    mutationFn: (status: Status) =>
      call(() => api.PUT("/phenomena/{phenomenonId}/status", { params: { path: { phenomenonId: saved.id } }, body: { baseRevision: saved.revision, status } })),
    onMutate: () => setMessage(undefined),
    onSuccess: (updated) => {
      setSaved(updated);
      setDraft(draftOf(updated));
      setMessage({ tone: "ok", text: updated.status === "published" ? "Published. Everyone can see it now." : "Archived. Only admins can see it now." });
      router.refresh();
    },
    onError: (error) => refused(error, "The status could not be changed. Try again."),
  });

  const remove = useMutation({
    mutationFn: () => call(() => api.DELETE("/phenomena/{phenomenonId}", { params: { path: { phenomenonId: saved.id } } })),
    onSuccess: () => {
      router.push("/admin/phenomena");
      router.refresh();
    },
    onError: (error) => {
      setConfirmingDelete(false);
      refused(error, "The draft could not be deleted. Try again.");
    },
  });

  const busy = save.isPending || changeStatus.isPending || remove.isPending;
  const savedBlanks = blankPaths(saved.weightingFunction);

  const addCharacteristic = () =>
    change({ items: [...draft.items, { uid: nextUid(), value: newCharacteristic(draft.items.map((item) => item.value.key)), saved: undefined, keyEdited: false }] });

  const changeItems = (items: CharacteristicItem[]) => {
    // A key that changed is followed by the function, so renaming does not break it.
    let weightingFunction = draft.weightingFunction;
    for (const item of items) {
      const before = draft.items.find((candidate) => candidate.uid === item.uid);
      if (before && before.value.key !== item.value.key) {
        weightingFunction = renameKey(weightingFunction, before.value.key, item.value.key);
      }
    }
    change({ items, weightingFunction });
  };

  const trySave = () => {
    setTriedToSave(true);
    if (allIssues.length === 0) {
      save.mutate();
    }
  };

  const discard = () => {
    setTriedToSave(false);
    setDraft(draftOf(saved));
    setProblemPath(undefined);
    setMessage(undefined);
  };

  let statusHint: string | undefined;
  if (dirty) {
    statusHint = "Save or discard your changes first.";
  } else if (saved.status !== "published" && savedBlanks.length > 0) {
    statusHint = "Fill in every part of the weighting function to publish.";
  }

  return (
    <>
      <Link href="/admin/phenomena" className={styles.backLink}>
        ← All phenomena
      </Link>
      <div className={styles.titleRow}>
        <h1 className={ui.title} data-testid="phenomenon-name">{saved.name}</h1>
        <StatusBadge status={saved.status} />
      </div>

      <div className={styles.statusBar}>
        <p className={styles.muted}>{statusInfo[saved.status].explanation}</p>
        <StatusActions
          status={saved.status}
          disabled={busy || dirty}
          canPublish={savedBlanks.length === 0}
          confirmingDelete={confirmingDelete}
          onConfirmDelete={setConfirmingDelete}
          onStatus={(status) => changeStatus.mutate(status)}
          onDelete={() => remove.mutate()}
          pending={changeStatus.isPending ? "status" : remove.isPending ? "delete" : undefined}
        />
      </div>
      {statusHint && <p className={`${styles.hint} ${styles.statusHint}`}>{statusHint}</p>}

      <div className={styles.sections}>
        <section className={styles.card} aria-labelledby="details-title">
          <h2 id="details-title" className={styles.cardTitle}>Details</h2>
          <div className={styles.field}>
            <label htmlFor="phenomenon-name">Name</label>
            <input
              id="phenomenon-name"
              className={styles.input}
              value={draft.name}
              maxLength={200}
              disabled={busy}
              aria-invalid={!!nameIssue || undefined}
              aria-describedby={nameIssue ? "name-issue" : undefined}
              onChange={(event) => change({ name: event.target.value })}
            />
            {nameIssue && <span id="name-issue" className={styles.errorText}>{nameIssue}</span>}
          </div>
          <div className={styles.field}>
            <label htmlFor="phenomenon-description">Description</label>
            <textarea
              id="phenomenon-description"
              className={styles.input}
              value={draft.description}
              maxLength={2000}
              disabled={busy}
              aria-describedby="description-hint"
              onChange={(event) => change({ description: event.target.value })}
            />
            <span id="description-hint" className={styles.hint}>What the phenomenon is and what its map shows. Public once published.</span>
          </div>
        </section>

        <section className={styles.card} aria-labelledby="characteristics-title">
          <div>
            <h2 id="characteristics-title" className={styles.cardTitle}>Characteristics</h2>
            <p className={styles.muted}>
              The fields every report of this phenomenon carries. Once saved, a characteristic keeps its key and type, and can be retired but not removed, because reports already filed may carry it.
            </p>
          </div>
          <CharacteristicsEditor items={draft.items} onChange={changeItems} onAdd={addCharacteristic} issues={issues} problemPath={problemPath} disabled={busy} />
        </section>

        <section className={styles.card} aria-labelledby="function-title">
          <div>
            <h2 id="function-title" className={styles.cardTitle}>Weighting function</h2>
            <p className={styles.muted}>
              How the reports located in each region become the index that colours it on the map. It can use the region&apos;s population and the
              number, yes/no and category characteristics above.
            </p>
          </div>
          <WeightingEditor
            tree={draft.weightingFunction}
            characteristics={definition.characteristics}
            onChange={(weightingFunction) => change({ weightingFunction })}
            issues={issues}
            problemPath={problemPath}
            disabled={busy}
          />
        </section>
      </div>

      {(dirty || message) && (
        <div className={styles.saveBar} data-testid="save-bar">
          {message ? (
            <div className={styles.message} data-tone={message.tone} role={message.tone === "error" ? "alert" : "status"} data-testid="phenomenon-message">
              <p>{message.text}</p>
              {message.action}
            </div>
          ) : (
            <p>{issues.size > 0 ? `${issues.size === 1 ? "One thing needs" : `${issues.size} things need`} fixing before saving.` : "You have unsaved changes."}</p>
          )}
          {dirty && (
            <div className={styles.actions}>
              <button type="button" className={ui.button} onClick={discard} disabled={busy}>
                Discard
              </button>
              <button type="button" className={`${ui.button} ${styles.primary}`} onClick={trySave} disabled={busy || issues.size > 0}>
                {save.isPending ? "Saving..." : "Save"}
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}

interface StatusActionsProps {
  status: Status;
  disabled: boolean;
  canPublish: boolean;
  confirmingDelete: boolean;
  onConfirmDelete: (confirming: boolean) => void;
  onStatus: (status: Status) => void;
  onDelete: () => void;
  pending: "status" | "delete" | undefined;
}

function StatusActions({ status, disabled, canPublish, confirmingDelete, onConfirmDelete, onStatus, onDelete, pending }: StatusActionsProps) {
  if (confirmingDelete) {
    return (
      <div className={styles.confirm} role="group" aria-label="Delete this draft">
        <span>Delete this draft for good?</span>
        <button type="button" className={`${ui.button} ${styles.danger}`} onClick={onDelete} disabled={pending === "delete"}>
          {pending === "delete" ? "Deleting..." : "Delete"}
        </button>
        <button type="button" className={ui.button} onClick={() => onConfirmDelete(false)} disabled={pending === "delete"}>
          Cancel
        </button>
      </div>
    );
  }
  return (
    <div className={styles.actions}>
      {status === "draft" && (
        <button type="button" className={`${ui.button} ${styles.danger}`} onClick={() => onConfirmDelete(true)} disabled={disabled}>
          Delete draft
        </button>
      )}
      {status === "published" && (
        <button type="button" className={ui.button} onClick={() => onStatus("archived")} disabled={disabled}>
          {pending === "status" ? "Archiving..." : "Archive"}
        </button>
      )}
      {status !== "published" && (
        <button type="button" className={`${ui.button} ${styles.primary}`} onClick={() => onStatus("published")} disabled={disabled || !canPublish}>
          {pending === "status" ? "Publishing..." : status === "archived" ? "Publish again" : "Publish"}
        </button>
      )}
    </div>
  );
}
