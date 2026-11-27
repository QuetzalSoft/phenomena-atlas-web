// A phenomenon's refresh interval: how often its index is recomputed, in whole minutes. See
// ADR 0015 in the system repository. The editor lets an admin type it in minutes, hours or days.

/** The smallest interval, in minutes. From `RefreshIntervalMinutes` in the contract. */
export const minRefreshIntervalMinutes = 5;
/** The largest interval, in minutes: 30 days. From `RefreshIntervalMinutes` in the contract. */
export const maxRefreshIntervalMinutes = 43_200;
/** What a new phenomenon starts with, as the contract describes `createPhenomenon`. */
export const defaultRefreshIntervalMinutes = 60;

export type IntervalUnit = "minutes" | "hours" | "days";

/** Every unit, largest first, with how many minutes one of it holds. */
export const intervalUnits: readonly { unit: IntervalUnit; minutes: number; singular: string; plural: string }[] = [
  { unit: "days", minutes: 1440, singular: "day", plural: "days" },
  { unit: "hours", minutes: 60, singular: "hour", plural: "hours" },
  { unit: "minutes", minutes: 1, singular: "minute", plural: "minutes" },
];

const infoOf = (unit: IntervalUnit) => intervalUnits.find((info) => info.unit === unit)!;

/** An interval as an admin types it. `amount` is undefined while empty, NaN while not a number. */
export interface IntervalAmount {
  amount: number | undefined;
  unit: IntervalUnit;
}

/** Minutes in the largest unit that divides them exactly: 360 is 6 hours, 90 is 90 minutes, 1440 is 1 day. */
export function amountOf(minutes: number): IntervalAmount {
  const info = intervalUnits.find((candidate) => minutes % candidate.minutes === 0) ?? infoOf("minutes");
  return { amount: minutes / info.minutes, unit: info.unit };
}

/**
 * The interval in minutes, or NaN while the amount is empty or not a number. A product that
 * is a whole number but for floating-point noise, such as 0.1 hours, counts as that number.
 */
export function minutesOf({ amount, unit }: IntervalAmount): number {
  if (amount === undefined || !Number.isFinite(amount)) {
    return Number.NaN;
  }
  const minutes = amount * infoOf(unit).minutes;
  const whole = Math.round(minutes);
  return Math.abs(minutes - whole) < 1e-9 ? whole : minutes;
}

/** What is wrong with an interval in minutes, or undefined when the API would accept it. */
export function refreshIntervalIssue(minutes: number): string | undefined {
  if (Number.isNaN(minutes)) {
    return "Enter how often to refresh the map.";
  }
  if (!Number.isInteger(minutes)) {
    return "Use a whole number of minutes.";
  }
  if (minutes < minRefreshIntervalMinutes || minutes > maxRefreshIntervalMinutes) {
    return "Use an interval from 5 minutes to 30 days.";
  }
  return undefined;
}

/** The interval to read: "Every hour", "Every 6 hours", "Every 90 minutes". */
export function intervalText(minutes: number): string {
  const { amount, unit } = amountOf(minutes);
  const info = infoOf(unit);
  return amount === 1 ? `Every ${info.singular}` : `Every ${amount} ${info.plural}`;
}
