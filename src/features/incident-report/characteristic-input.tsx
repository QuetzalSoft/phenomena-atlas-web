"use client";

import type { components } from "@quetzalsoft/phenomena-atlas-contract";
import { Field } from "@/components/field";
import form from "@/components/form.module.css";
import { NumberField } from "@/features/phenomenon/number-field";
import type { ValueDraft } from "./report-draft";
import styles from "./incident-report.module.css";

type Characteristic = components["schemas"]["Characteristic"];

interface CharacteristicInputProps {
  characteristic: Characteristic;
  value: ValueDraft;
  onChange: (value: ValueDraft) => void;
  issue: string | undefined;
  maxDate: string;
  disabled: boolean;
}

/** What the person is told about a characteristic beyond its label: its description and limits. */
function hintOf(characteristic: Characteristic): string | undefined {
  const parts = characteristic.description ? [characteristic.description] : [];
  if (characteristic.type === "number") {
    const { minimum, maximum, integer } = characteristic;
    const kind = integer ? "A whole number" : "A number";
    if (minimum !== undefined && maximum !== undefined) {
      parts.push(`${kind} from ${minimum} to ${maximum}.`);
    } else if (minimum !== undefined) {
      parts.push(`${kind}, ${minimum} or more.`);
    } else if (maximum !== undefined) {
      parts.push(`${kind}, ${maximum} or less.`);
    } else if (integer) {
      parts.push(`${kind}.`);
    }
  }
  return parts.length > 0 ? parts.join(" ") : undefined;
}

function Label({ characteristic }: { characteristic: Characteristic }) {
  return (
    <>
      {characteristic.label}
      {!characteristic.required && <span className={styles.optional}> (optional)</span>}
    </>
  );
}

/** One field of the report form, by characteristic type. Retired characteristics never get here. */
export function CharacteristicInput({ characteristic, value, onChange, issue, maxDate, disabled }: CharacteristicInputProps) {
  const hint = hintOf(characteristic);
  const invalid = issue ? true : undefined;

  if (characteristic.type === "boolean") {
    // Yes or no as two radios; an optional one can also be left unanswered.
    const choices: [string, boolean | undefined][] = [["Yes", true], ["No", false], ...(characteristic.required ? [] : [["Not stated", undefined] as [string, undefined]])];
    const name = `characteristic-${characteristic.key}`;
    return (
      <fieldset className={styles.choiceField} aria-invalid={invalid} aria-describedby={issue ? `${name}-issue` : hint ? `${name}-hint` : undefined}>
        <legend>
          <Label characteristic={characteristic} />
        </legend>
        <div className={styles.choices}>
          {choices.map(([label, choice]) => (
            <label key={label} className={form.check}>
              <input type="radio" name={name} checked={value === choice} disabled={disabled} onChange={() => onChange(choice)} />
              {label}
            </label>
          ))}
        </div>
        {issue ? (
          <span id={`${name}-issue`} className={form.errorText}>{issue}</span>
        ) : (
          hint && <span id={`${name}-hint`} className={form.hint}>{hint}</span>
        )}
      </fieldset>
    );
  }

  return (
    <Field label={<Label characteristic={characteristic} />} hint={hint} issue={issue} className={characteristic.type === "text" ? styles.wide : undefined}>
      {(field) => {
        switch (characteristic.type) {
          case "number":
            return (
              <div className={styles.withUnit}>
                <NumberField
                  {...field}
                  className={form.input}
                  value={typeof value === "number" ? value : undefined}
                  onValueChange={onChange}
                  step={characteristic.integer ? 1 : "any"}
                  inputMode={characteristic.integer ? "numeric" : "decimal"}
                  min={characteristic.minimum}
                  max={characteristic.maximum}
                  aria-invalid={invalid}
                  disabled={disabled}
                />
                {characteristic.unit && <span className={styles.unit}>{characteristic.unit}</span>}
              </div>
            );
          case "category":
            return (
              <select
                {...field}
                className={form.input}
                value={typeof value === "string" ? value : ""}
                aria-invalid={invalid}
                disabled={disabled}
                onChange={(event) => onChange(event.target.value === "" ? undefined : event.target.value)}
              >
                <option value="">{characteristic.required ? "Choose one" : "Not stated"}</option>
                {characteristic.options
                  .filter((option) => !option.retired)
                  .map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
              </select>
            );
          case "text":
            return (
              <textarea
                {...field}
                className={form.input}
                value={typeof value === "string" ? value : ""}
                maxLength={characteristic.maxLength}
                aria-invalid={invalid}
                disabled={disabled}
                onChange={(event) => onChange(event.target.value)}
              />
            );
          case "date":
            return (
              <input
                {...field}
                type="date"
                className={form.input}
                value={typeof value === "string" ? value : ""}
                max={maxDate}
                aria-invalid={invalid}
                disabled={disabled}
                onChange={(event) => onChange(event.target.value === "" ? undefined : event.target.value)}
              />
            );
        }
      }}
    </Field>
  );
}
