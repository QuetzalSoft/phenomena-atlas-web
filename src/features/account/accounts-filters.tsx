"use client";

import { useCallback, useEffect, useRef } from "react";
import ui from "@/components/ui.module.css";
import { hasFilters, isInvertedRange, noAccountFilters, searchMaxLength, type AccountFilters } from "./account-filters";
import { roleInfo, roles, type Role } from "./role";
import styles from "./account.module.css";

/** Wait this long after the last keystroke before searching, so typing does not flood the API. */
const searchDebounceMs = 300;

interface AccountsFiltersProps {
  filters: AccountFilters;
  onChange: (patch: Partial<AccountFilters>) => void;
}

/** Search, role and creation range. They combine: an account is listed only when it matches all of them. */
export function AccountsFilters({ filters, onChange }: AccountsFiltersProps) {
  // The search box is uncontrolled: what someone types before the page has hydrated is
  // still in it afterwards, and must not be lost.
  const searchRef = useRef<HTMLInputElement>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const hydrated = useRef(false);

  const search = useCallback(
    (text: string) => {
      clearTimeout(searchTimer.current);
      searchTimer.current = setTimeout(() => onChange({ q: text }), searchDebounceMs);
    },
    [onChange],
  );

  useEffect(() => () => clearTimeout(searchTimer.current), []);

  useEffect(() => {
    const input = searchRef.current;
    const firstRun = !hydrated.current;
    hydrated.current = true;
    if (!input || input.value === filters.q) {
      return;
    }
    if (firstRun || document.activeElement === input) {
      // Typed before hydration, or still being typed: the box is ahead of the URL.
      search(input.value);
    } else {
      // The URL changed from elsewhere, such as Clear filters or going back.
      input.value = filters.q;
    }
  }, [filters.q, search]);

  const inverted = isInvertedRange(filters);

  return (
    <div className={styles.filters} role="search" aria-label="Filter accounts">
      <div className={`${styles.filterField} ${styles.searchField}`}>
        <label htmlFor="account-search" className={styles.filterLabel}>Search</label>
        <input
          id="account-search"
          type="search"
          className={styles.input}
          placeholder="Name, username or email"
          ref={searchRef}
          defaultValue={filters.q}
          maxLength={searchMaxLength}
          autoComplete="off"
          onChange={(event) => search(event.target.value)}
        />
      </div>

      <div className={styles.filterField}>
        <label htmlFor="account-role-filter" className={styles.filterLabel}>Role</label>
        <select
          id="account-role-filter"
          className={styles.input}
          value={filters.role ?? ""}
          onChange={(event) => onChange({ role: (event.target.value || null) as Role | null })}
        >
          <option value="">All roles</option>
          {roles.map((role) => (
            <option key={role} value={role}>{roleInfo[role].label}</option>
          ))}
        </select>
      </div>

      <div
        role="group"
        className={`${styles.filterField} ${styles.dateRange}`}
        aria-labelledby="account-created-label"
        aria-describedby={inverted ? "account-range-error" : undefined}
      >
        <span id="account-created-label" className={styles.filterLabel}>Created (UTC)</span>
        <div className={styles.dateInputs}>
          <label htmlFor="account-created-from" className={styles.visuallyHidden}>Created from</label>
          <input
            id="account-created-from"
            type="date"
            className={styles.input}
            value={filters.from ?? ""}
            max={filters.to ?? undefined}
            onChange={(event) => onChange({ from: event.target.value || null })}
          />
          <span className={styles.rangeDash} aria-hidden>
            to
          </span>
          <label htmlFor="account-created-to" className={styles.visuallyHidden}>Created to</label>
          <input
            id="account-created-to"
            type="date"
            className={styles.input}
            value={filters.to ?? ""}
            min={filters.from ?? undefined}
            aria-invalid={inverted || undefined}
            onChange={(event) => onChange({ to: event.target.value || null })}
          />
        </div>
      </div>

      {hasFilters(filters) && (
        <button
          type="button"
          className={`${ui.button} ${styles.clearFilters}`}
          onClick={() => {
            clearTimeout(searchTimer.current);
            onChange(noAccountFilters);
          }}
        >
          Clear filters
        </button>
      )}

      {inverted && (
        <p id="account-range-error" className={styles.filterError} role="alert">
          The end date is before the start date.
        </p>
      )}
    </div>
  );
}
