import { useId, type ReactNode } from "react";
import form from "./form.module.css";

interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  issue?: string | undefined;
  className?: string;
  /** Renders the control, which spreads `field` to get its id and description. */
  children: (field: { id: string; "aria-describedby"?: string }) => ReactNode;
}

/**
 * A labelled control with a hint or, when there is one, the problem to fix. Only the label
 * names the control; the hint or problem describes it.
 */
export function Field({ label, hint, issue, className, children }: FieldProps) {
  const id = useId();
  const describedBy = issue ? `${id}-issue` : hint ? `${id}-hint` : undefined;
  return (
    <div className={`${form.field} ${className ?? ""}`}>
      <label htmlFor={id}>{label}</label>
      {children({ id, ...(describedBy && { "aria-describedby": describedBy }) })}
      {issue ? (
        <span id={`${id}-issue`} className={form.errorText}>{issue}</span>
      ) : (
        hint && <span id={`${id}-hint`} className={form.hint}>{hint}</span>
      )}
    </div>
  );
}
