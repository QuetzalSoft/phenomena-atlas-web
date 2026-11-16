"use client";

import { useState, type InputHTMLAttributes } from "react";

type NumberFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
  /** NaN or undefined while the field is empty. */
  value: number | undefined;
  /** Called with undefined when the field is emptied, or NaN when the text is not a number yet. */
  onValueChange: (value: number | undefined) => void;
};

/**
 * A number input that keeps what is typed, such as `-` or `1.`, while it is not a number yet,
 * instead of snapping back to the last valid value.
 */
export function NumberField({ value, onValueChange, ...props }: NumberFieldProps) {
  const [text, setText] = useState(value === undefined || Number.isNaN(value) ? "" : String(value));
  const parsed = text.trim() === "" ? undefined : Number(text);
  const inSync = parsed === value || (Number.isNaN(parsed) && Number.isNaN(value)) || (parsed === undefined && (value === undefined || Number.isNaN(value)));
  return (
    <input
      {...props}
      type="number"
      step={props.step ?? "any"}
      inputMode={props.inputMode ?? "decimal"}
      value={inSync ? text : value === undefined || Number.isNaN(value) ? "" : String(value)}
      onChange={(event) => {
        setText(event.target.value);
        onValueChange(event.target.value.trim() === "" ? undefined : Number(event.target.value));
      }}
    />
  );
}
