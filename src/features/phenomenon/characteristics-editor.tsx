"use client";

import { Field } from "@/components/field";
import ui from "@/components/ui.module.css";
import {
  type CategoryOption,
  type Characteristic,
  characteristicTypeInfo,
  characteristicTypes,
  type CharacteristicType,
  newOption,
  uniqueKey,
  withType,
  without,
} from "./characteristic-draft";
import { ArrowDownIcon, ArrowUpIcon, CloseIcon } from "./icons";
import { NumberField } from "./number-field";
import styles from "./phenomenon.module.css";

/** A characteristic being edited, with what the editor needs to know about it. */
export interface CharacteristicItem {
  /** Stable across edits, for React. Never sent. */
  uid: string;
  value: Characteristic;
  /** As last saved, when it was: its key and type are then fixed, and it can only be retired. */
  saved: Characteristic | undefined;
  /** Whether the admin typed the key, which stops it following the label. */
  keyEdited: boolean;
}

interface CharacteristicsEditorProps {
  items: CharacteristicItem[];
  onChange: (items: CharacteristicItem[]) => void;
  onAdd: () => void;
  issues: ReadonlyMap<string, string>;
  /** Where the API's last refusal points, such as `/characteristics/2/type`. */
  problemPath: string | undefined;
  disabled: boolean;
}

export function CharacteristicsEditor({ items, onChange, onAdd, issues, problemPath, disabled }: CharacteristicsEditorProps) {
  const replace = (index: number, item: CharacteristicItem) => onChange(items.map((current, position) => (position === index ? item : current)));
  const move = (index: number, by: -1 | 1) => {
    const next = [...items];
    const [moved] = next.splice(index, 1);
    next.splice(index + by, 0, moved!);
    onChange(next);
  };

  return (
    <>
      {items.length === 0 ? (
        <p className={styles.muted}>No characteristics yet. Reports will only record where and when something happened, and a description.</p>
      ) : (
        <ol className={styles.characteristics} data-testid="characteristics">
          {items.map((item, index) => (
            <CharacteristicRow
              key={item.uid}
              item={item}
              path={`/characteristics/${index}`}
              taken={items.filter((other) => other.uid !== item.uid).map((other) => other.value.key)}
              position={{ index, count: items.length }}
              onChange={(next) => replace(index, next)}
              onMove={(by) => move(index, by)}
              onRemove={() => onChange(items.filter((other) => other.uid !== item.uid))}
              issues={issues}
              problemPath={problemPath}
              disabled={disabled}
            />
          ))}
        </ol>
      )}
      <div className={styles.actions}>
        <button type="button" className={ui.button} onClick={onAdd} disabled={disabled} data-testid="add-characteristic">
          Add characteristic
        </button>
      </div>
    </>
  );
}

interface RowProps {
  item: CharacteristicItem;
  path: string;
  taken: string[];
  position: { index: number; count: number };
  onChange: (item: CharacteristicItem) => void;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
  issues: ReadonlyMap<string, string>;
  problemPath: string | undefined;
  disabled: boolean;
}

function CharacteristicRow({ item, path, taken, position, onChange, onMove, onRemove, issues, problemPath, disabled }: RowProps) {
  const { value, saved } = item;
  const name = value.label.trim() || "New characteristic";
  const problem = problemPath !== undefined && (problemPath === path || problemPath.startsWith(`${path}/`));
  const set = (patch: Partial<Characteristic>) => onChange({ ...item, value: { ...value, ...patch } as Characteristic });

  const setLabel = (label: string) => {
    // A new characteristic's key follows its label until the admin types one.
    const key = saved || item.keyEdited ? value.key : uniqueKey(label, taken, "characteristic");
    onChange({ ...item, value: { ...value, label, key } });
  };

  const fieldIssue = (field: string) => issues.get(`${path}/${field}`);

  return (
    <li className={styles.characteristic} data-retired={value.retired || undefined} data-problem={problem || undefined} data-testid="characteristic" data-key={value.key}>
      <div className={styles.characteristicHeader}>
        <div className={styles.characteristicTitle}>
          <span>{name}</span>
          <span className={styles.tag}>{characteristicTypeInfo[value.type].label}</span>
          {value.required && <span className={styles.tag}>Required</span>}
          {value.retired && <span className={styles.tag}>Retired</span>}
          {!saved && <span className={styles.tag}>Not saved yet</span>}
        </div>
        <div className={styles.rowTools}>
          <button type="button" className={styles.iconButton} aria-label={`Move ${name} up`} title="Move up" disabled={disabled || position.index === 0} onClick={() => onMove(-1)}>
            <ArrowUpIcon />
          </button>
          <button
            type="button"
            className={styles.iconButton}
            aria-label={`Move ${name} down`}
            title="Move down"
            disabled={disabled || position.index === position.count - 1}
            onClick={() => onMove(1)}
          >
            <ArrowDownIcon />
          </button>
          {saved ? (
            <button type="button" className={`${ui.button} ${styles.compactButton}`} disabled={disabled} onClick={() => set({ retired: !value.retired })}>
              {value.retired ? "Restore" : "Retire"}
            </button>
          ) : (
            <button type="button" className={styles.iconButton} aria-label={`Remove ${name}`} title="Remove" disabled={disabled} onClick={onRemove}>
              <CloseIcon />
            </button>
          )}
        </div>
      </div>

      <div className={styles.grid}>
        <Field label="Label" issue={fieldIssue("label")}>
          {(field) => (
            <input className={styles.input} value={value.label} disabled={disabled} maxLength={100} {...field} aria-invalid={!!fieldIssue("label") || undefined} onChange={(event) => setLabel(event.target.value)} />
          )}
        </Field>
        <Field label="Key" issue={fieldIssue("key")} hint={saved ? "Fixed once saved." : "How reports and the function refer to it."}>
          {(field) => (
            <input
              className={`${styles.input} ${styles.mono}`}
              value={value.key}
              disabled={disabled || !!saved}
              maxLength={40}
              spellCheck={false}
              autoCapitalize="none"
              {...field}
              aria-invalid={!!fieldIssue("key") || undefined}
              onChange={(event) => onChange({ ...item, keyEdited: true, value: { ...value, key: event.target.value } })}
            />
          )}
        </Field>
        <Field label="Type" issue={fieldIssue("type")} hint={saved ? "Fixed once saved." : characteristicTypeInfo[value.type].description}>
          {(field) => (
            <select
              className={styles.input}
              value={value.type}
              disabled={disabled || !!saved}
              {...field}
              onChange={(event) => onChange({ ...item, value: withType(value, event.target.value as CharacteristicType) })}
            >
              {characteristicTypes.map((type) => (
                <option key={type} value={type}>{characteristicTypeInfo[type].label}</option>
              ))}
            </select>
          )}
        </Field>
        <div className={styles.checkCell}>
          <label className={styles.check}>
            <input type="checkbox" checked={value.required} disabled={disabled} onChange={(event) => set({ required: event.target.checked })} />
            Required in new reports
          </label>
        </div>
        <Field label="Description" className={styles.wide} hint="Optional help shown when filing a report.">
          {(field) => (
            <input
              className={styles.input}
              value={value.description ?? ""}
              disabled={disabled}
              maxLength={500}
              {...field}
              onChange={(event) => onChange({ ...item, value: withDescription(value, event.target.value) })}
            />
          )}
        </Field>
        <TypeSettings item={item} path={path} onChange={onChange} issues={issues} disabled={disabled} />
      </div>
    </li>
  );
}

function withDescription(characteristic: Characteristic, description: string): Characteristic {
  const rest = without(characteristic, "description");
  return (description === "" ? rest : { ...rest, description }) as Characteristic;
}

function TypeSettings({ item, path, onChange, issues, disabled }: { item: CharacteristicItem; path: string; onChange: (item: CharacteristicItem) => void; issues: ReadonlyMap<string, string>; disabled: boolean }) {
  const { value } = item;
  const update = (next: Characteristic) => onChange({ ...item, value: next });

  if (value.type === "number") {
    const bound = (field: "minimum" | "maximum", bound: number | undefined) => {
      const rest = without(value, field);
      update(bound === undefined ? rest : { ...rest, [field]: bound });
    };
    return (
      <>
        <div className={styles.checkCell}>
          <label className={styles.check}>
            <input type="checkbox" checked={value.integer} disabled={disabled} onChange={(event) => update({ ...value, integer: event.target.checked })} />
            Whole numbers only
          </label>
        </div>
        <Field label="Minimum" hint="Optional.">
          {(field) => <NumberField className={styles.input} value={value.minimum} disabled={disabled} {...field} onValueChange={(next) => bound("minimum", next)} />}
        </Field>
        <Field label="Maximum" hint="Optional." issue={issues.get(`${path}/maximum`)}>
          {(field) => (
            <NumberField
              className={styles.input}
              value={value.maximum}
              disabled={disabled}
              {...field}
              aria-invalid={!!issues.get(`${path}/maximum`) || undefined}
              onValueChange={(next) => bound("maximum", next)}
            />
          )}
        </Field>
        <Field label="Unit" hint="Optional, such as people or MXN.">
          {(field) => (
            <input
              className={styles.input}
              value={value.unit ?? ""}
              maxLength={20}
              disabled={disabled}
              {...field}
              onChange={(event) => {
                const rest = without(value, "unit");
                update(event.target.value === "" ? rest : { ...rest, unit: event.target.value });
              }}
            />
          )}
        </Field>
      </>
    );
  }

  if (value.type === "text") {
    const issue = issues.get(`${path}/maxLength`);
    return (
      <Field label="Maximum length" hint="In characters, up to 5000." issue={issue}>
        {(field) => (
          <NumberField
            className={styles.input}
            value={value.maxLength}
            step={1}
            min={1}
            max={5000}
            inputMode="numeric"
            disabled={disabled}
            {...field}
            aria-invalid={!!issue || undefined}
            onValueChange={(next) => update({ ...value, maxLength: next ?? Number.NaN })}
          />
        )}
      </Field>
    );
  }

  if (value.type === "category") {
    return <CategoryOptions item={item} path={path} onChange={onChange} issues={issues} disabled={disabled} />;
  }

  return null;
}

function CategoryOptions({ item, path, onChange, issues, disabled }: { item: CharacteristicItem; path: string; onChange: (item: CharacteristicItem) => void; issues: ReadonlyMap<string, string>; disabled: boolean }) {
  const value = item.value as Extract<Characteristic, { type: "category" }>;
  const savedKeys = new Set(item.saved?.type === "category" ? item.saved.options.map((option) => option.key) : []);
  const setOptions = (options: CategoryOption[]) => onChange({ ...item, value: { ...value, options } });
  const setOption = (index: number, option: CategoryOption) => setOptions(value.options.map((current, position) => (position === index ? option : current)));
  const optionsIssue = issues.get(`${path}/options`);

  return (
    <div className={styles.wide}>
      <div className={styles.optionsHeader} aria-hidden>
        <span>Option</span>
        <span>Weight</span>
        <span />
      </div>
      <ul className={styles.options} aria-label={`Options of ${value.label || "the category"}`}>
        {value.options.map((option, index) => {
          const optionPath = `${path}/options/${index}`;
          const saved = savedKeys.has(option.key);
          const labelIssue = issues.get(`${optionPath}/label`);
          const weightIssue = issues.get(`${optionPath}/weight`);
          const optionName = option.label.trim() || `option ${index + 1}`;
          return (
            <li key={index} className={styles.option} data-retired={option.retired || undefined} data-testid="category-option">
              <div>
                <input
                  className={styles.input}
                  aria-label={`Label of ${optionName}`}
                  value={option.label}
                  maxLength={100}
                  disabled={disabled}
                  aria-invalid={!!labelIssue || undefined}
                  onChange={(event) => {
                    const label = event.target.value;
                    // A new option's key follows its label; a saved one keeps its key.
                    const others = value.options.filter((_, position) => position !== index).map((other) => other.key);
                    const key = saved ? option.key : uniqueKey(label, others, `option_${index + 1}`);
                    setOption(index, { ...option, label, key });
                  }}
                />
                {labelIssue && <p className={styles.errorText}>{labelIssue}</p>}
              </div>
              <div>
                <NumberField
                  className={styles.input}
                  aria-label={`Weight of ${optionName}`}
                  value={option.weight}
                  disabled={disabled}
                  aria-invalid={!!weightIssue || undefined}
                  onValueChange={(weight) => setOption(index, { ...option, weight: weight ?? Number.NaN })}
                />
                {weightIssue && <p className={styles.errorText}>{weightIssue}</p>}
              </div>
              {saved ? (
                <button type="button" className={`${ui.button} ${styles.compactButton}`} disabled={disabled} onClick={() => setOption(index, { ...option, retired: !option.retired })}>
                  {option.retired ? "Restore" : "Retire"}
                </button>
              ) : (
                <button
                  type="button"
                  className={styles.iconButton}
                  aria-label={`Remove ${optionName}`}
                  title="Remove"
                  disabled={disabled || value.options.length === 1}
                  onClick={() => setOptions(value.options.filter((_, position) => position !== index))}
                >
                  <CloseIcon />
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {optionsIssue && <p className={styles.errorText}>{optionsIssue}</p>}
      <p className={styles.hint}>In the weighting function, a report counts as the weight of the option it chose.</p>
      <button type="button" className={styles.linkButton} disabled={disabled} onClick={() => setOptions([...value.options, newOption(value.options)])}>
        Add option
      </button>
    </div>
  );
}

