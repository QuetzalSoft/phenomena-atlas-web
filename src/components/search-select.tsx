"use client";

import { type KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import form from "./form.module.css";
import styles from "./search-select.module.css";

export interface SearchSelectOption<T extends string | number> {
  value: T;
  label: string;
  /** Shown beside the label, such as the municipality a region lies in. Also searched. */
  detail?: string;
}

interface SearchSelectProps<T extends string | number> {
  /** The trigger's id, so a label can name it. */
  id?: string;
  options: readonly SearchSelectOption<T>[];
  value: T | undefined;
  onChange: (value: T) => void;
  placeholder: string;
  searchLabel: string;
  disabled?: boolean;
  invalid?: boolean;
  "aria-describedby"?: string;
  testId?: string;
}

/** Lower case, without accents, so "anahuac" finds "Anáhuac". */
const normalize = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/**
 * A dropdown with a search box on top that narrows its options as the person types. Built
 * on the ARIA combobox pattern: the search box controls the list, and the arrow keys, Enter
 * and Escape work as in a native select.
 */
export function SearchSelect<T extends string | number>({
  id,
  options,
  value,
  onChange,
  placeholder,
  searchLabel,
  disabled,
  invalid,
  testId,
  ...aria
}: SearchSelectProps<T>) {
  const ownId = useId();
  const listId = `${ownId}-list`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = options.find((option) => option.value === value);
  const matches = useMemo(() => {
    const words = normalize(query).split(/\s+/).filter(Boolean);
    return options.filter((option) => {
      const text = normalize(`${option.label} ${option.detail ?? ""}`);
      return words.every((word) => text.includes(word));
    });
  }, [options, query]);

  // Closes when focus or a click goes anywhere else.
  useEffect(() => {
    if (!open) {
      return;
    }
    const away = (event: Event) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("focusin", away);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("focusin", away);
    };
  }, [open]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const show = () => {
    setQuery("");
    const index = options.findIndex((option) => option.value === value);
    setActive(Math.max(index, 0));
    setOpen(true);
  };

  const choose = (option: SearchSelectOption<T>) => {
    onChange(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (matches.length > 0) {
        setActive((current) => (current + (event.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length);
      }
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      setActive(event.key === "Home" ? 0 : Math.max(matches.length - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const option = matches[active];
      if (option) {
        choose(option);
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    }
  };

  return (
    <div className={styles.root} ref={rootRef} data-testid={testId}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        className={`${form.input} ${styles.trigger}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        // A button cannot be aria-invalid; the problem reaches it through aria-describedby.
        data-invalid={invalid || undefined}
        aria-describedby={aria["aria-describedby"]}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={(event) => {
          if (!open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
            event.preventDefault();
            show();
          }
        }}
      >
        <span className={`${styles.triggerText} ${selected ? "" : styles.placeholder}`}>
          {selected ? `${selected.label}${selected.detail ? ` · ${selected.detail}` : ""}` : placeholder}
        </span>
        <svg className={styles.chevron} width="12" height="12" viewBox="0 0 12 12" aria-hidden>
          <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className={styles.popover}>
          <div className={styles.search}>
            <input
              className={form.input}
              role="combobox"
              aria-label={searchLabel}
              aria-expanded
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={matches[active] ? `${ownId}-option-${active}` : undefined}
              placeholder={searchLabel}
              value={query}
              autoFocus
              autoComplete="off"
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
            />
          </div>
          {matches.length > 0 ? (
            <ul ref={listRef} id={listId} role="listbox" className={styles.list} aria-label={searchLabel}>
              {matches.map((option, index) => (
                <li
                  key={option.value}
                  id={`${ownId}-option-${index}`}
                  role="option"
                  aria-selected={option.value === value}
                  data-active={index === active}
                  data-index={index}
                  className={styles.option}
                  // Keeps focus in the search box, so the list does not close before the click lands.
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseMove={() => setActive(index)}
                  onClick={() => choose(option)}
                >
                  <span>{option.label}</span>
                  {option.detail && <span className={styles.optionDetail}>{option.detail}</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.empty} role="status">
              Nothing matches &quot;{query}&quot;.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
