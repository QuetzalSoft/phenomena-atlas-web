"use client";

import { useRef, type ReactNode } from "react";
import styles from "./account.module.css";

/**
 * An info button that opens the role definitions in a modal. A native <dialog>: it traps
 * focus, closes on Escape and returns focus to the button on its own.
 */
export function RolesDialog({ children }: { children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        className={styles.infoButton}
        aria-label="About roles"
        aria-haspopup="dialog"
        title="About roles"
        onClick={() => dialog.current?.showModal()}
      >
        <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden>
          <circle cx="10" cy="10" r="8.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="10" cy="6.4" r="1.1" fill="currentColor" />
          <path d="M10 9.2v5.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>

      <dialog
        ref={dialog}
        className={styles.dialog}
        aria-labelledby="roles-dialog-title"
        // A click on the backdrop lands on the dialog element itself, not on its content.
        onClick={(event) => event.target === event.currentTarget && dialog.current?.close()}
      >
        <div className={styles.dialogBody}>
          <header className={styles.dialogHeader}>
            <h2 id="roles-dialog-title" className={styles.sectionTitle}>Roles</h2>
            <button
              type="button"
              className={styles.dialogClose}
              aria-label="Close"
              onClick={() => dialog.current?.close()}
            >
              <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden>
                <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
            </button>
          </header>
          {children}
        </div>
      </dialog>
    </>
  );
}
