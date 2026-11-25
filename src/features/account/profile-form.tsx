"use client";

import type { components } from "@quetzalsoft/phenomena-atlas-contract";
import { useId, useState, type ChangeEvent, type FormEvent } from "react";
import ui from "@/components/ui.module.css";
import { RequestFailed } from "@/lib/api/request";
import { profileFailureCopy } from "./profile-failure";
import { SignInLink } from "./sign-in-link";
import styles from "./account.module.css";

type Account = components["schemas"]["Account"];
type ProfileValues = components["schemas"]["AccountProfile"];

interface ProfileFormProps {
  account: Account;
  /**
   * Writes the details and answers the account as the API saved it. Throws RequestFailed when
   * the API refuses or cannot be reached.
   */
  save: (values: ProfileValues) => Promise<Account>;
  /** Called after a successful save, such as to close the form. */
  onSaved?: () => void;
  onCancel?: () => void;
  testId?: string;
}

/** First name, last name and email, saved together: either all of them change or none does. */
export function ProfileForm({ account, save, onSaved, onCancel, testId }: ProfileFormProps) {
  const id = useId();
  const [values, setValues] = useState(() => valuesOf(account));
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [failure, setFailure] = useState<RequestFailed | undefined>();

  const field = (name: keyof ProfileValues) => ({
    id: `${id}-${name}`,
    value: values[name],
    onChange: (event: ChangeEvent<HTMLInputElement>) => {
      setSaved(false);
      setValues((current) => ({ ...current, [name]: event.target.value }));
    },
    disabled: pending,
    required: true,
  });

  async function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = {
      firstName: values.firstName.trim(),
      lastName: values.lastName.trim(),
      email: values.email.trim(),
    };
    setValues(trimmed);
    setPending(true);
    setSaved(false);
    setFailure(undefined);
    try {
      // The identity provider may store a value differently, such as an email in lower case.
      setValues(valuesOf(await save(trimmed)));
      setSaved(true);
      onSaved?.();
    } catch (error) {
      setFailure(error instanceof RequestFailed ? error : new RequestFailed(undefined, undefined));
    } finally {
      setPending(false);
    }
  }

  return (
    <form className={styles.profileForm} onSubmit={(event) => void submit(event)} data-testid={testId}>
      <div className={styles.formField}>
        <label htmlFor={`${id}-firstName`} className={styles.filterLabel}>First name</label>
        <input className={styles.input} autoComplete="given-name" maxLength={100} {...field("firstName")} />
      </div>
      <div className={styles.formField}>
        <label htmlFor={`${id}-lastName`} className={styles.filterLabel}>Last name</label>
        <input className={styles.input} autoComplete="family-name" maxLength={100} {...field("lastName")} />
      </div>
      <div className={styles.formField}>
        <label htmlFor={`${id}-email`} className={styles.filterLabel}>Email</label>
        <input className={styles.input} type="email" autoComplete="email" maxLength={254} {...field("email")} />
      </div>

      <div className={styles.formActions}>
        <button type="submit" className={ui.button} disabled={pending}>
          {pending ? "Saving..." : "Save"}
        </button>
        {onCancel && (
          <button type="button" className={ui.button} onClick={onCancel} disabled={pending}>
            Cancel
          </button>
        )}
      </div>

      {saved && (
        <p className={styles.successText} role="status">Details saved.</p>
      )}
      {failure && (
        <p className={styles.formError} role="alert">
          {profileFailureCopy(failure)}
          {failure.status === 401 && <> <SignInLink label="Sign in again" /></>}
        </p>
      )}
    </form>
  );
}

function valuesOf(account: Account): ProfileValues {
  return { firstName: account.firstName ?? "", lastName: account.lastName ?? "", email: account.email ?? "" };
}
