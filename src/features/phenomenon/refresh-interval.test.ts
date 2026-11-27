import { describe, expect, it } from "vitest";
import {
  amountOf,
  defaultRefreshIntervalMinutes,
  intervalText,
  maxRefreshIntervalMinutes,
  minRefreshIntervalMinutes,
  minutesOf,
  refreshIntervalIssue,
} from "./refresh-interval";

describe("the limits", () => {
  it("are the contract's: 5 minutes to 30 days, 60 for a new phenomenon", () => {
    expect([minRefreshIntervalMinutes, maxRefreshIntervalMinutes, defaultRefreshIntervalMinutes]).toEqual([5, 43_200, 60]);
    expect(maxRefreshIntervalMinutes).toBe(30 * 24 * 60);
  });
});

describe("showing minutes in the largest unit that divides them", () => {
  it("picks days, then hours, then minutes", () => {
    expect(amountOf(360)).toEqual({ amount: 6, unit: "hours" });
    expect(amountOf(90)).toEqual({ amount: 90, unit: "minutes" });
    expect(amountOf(1440)).toEqual({ amount: 1, unit: "days" });
    expect(amountOf(60)).toEqual({ amount: 1, unit: "hours" });
    expect(amountOf(43_200)).toEqual({ amount: 30, unit: "days" });
    expect(amountOf(1500)).toEqual({ amount: 25, unit: "hours" });
  });

  it("goes back to the same minutes", () => {
    for (const minutes of [5, 59, 60, 90, 360, 1440, 1500, 43_200]) {
      expect(minutesOf(amountOf(minutes))).toBe(minutes);
    }
  });
});

describe("turning what is typed into minutes", () => {
  it("multiplies by the unit", () => {
    expect(minutesOf({ amount: 6, unit: "hours" })).toBe(360);
    expect(minutesOf({ amount: 2, unit: "days" })).toBe(2880);
    expect(minutesOf({ amount: 1.5, unit: "hours" })).toBe(90);
    expect(minutesOf({ amount: 0.1, unit: "hours" })).toBe(6);
  });

  it("is NaN while the field is empty or not a number", () => {
    expect(minutesOf({ amount: undefined, unit: "hours" })).toBeNaN();
    expect(minutesOf({ amount: Number.NaN, unit: "minutes" })).toBeNaN();
  });
});

describe("checking an interval as the API would", () => {
  it("accepts a whole number of minutes from 5 to 43200", () => {
    for (const minutes of [5, 90, 43_200, minutesOf({ amount: 1.5, unit: "hours" })]) {
      expect(refreshIntervalIssue(minutes)).toBeUndefined();
    }
  });

  it("refuses an empty field, a part of a minute and anything out of range", () => {
    expect(refreshIntervalIssue(minutesOf({ amount: undefined, unit: "minutes" }))).toBe("Enter how often to refresh the map.");
    expect(refreshIntervalIssue(minutesOf({ amount: 0.5, unit: "minutes" }))).toBe("Use a whole number of minutes.");
    for (const minutes of [0, 4, 43_201, minutesOf({ amount: 31, unit: "days" })]) {
      expect(refreshIntervalIssue(minutes)).toBe("Use an interval from 5 minutes to 30 days.");
    }
  });
});

describe("the interval as text", () => {
  it("uses the largest unit, singular or plural", () => {
    expect(intervalText(360)).toBe("Every 6 hours");
    expect(intervalText(60)).toBe("Every hour");
    expect(intervalText(1440)).toBe("Every day");
    expect(intervalText(90)).toBe("Every 90 minutes");
    expect(intervalText(43_200)).toBe("Every 30 days");
    expect(intervalText(1)).toBe("Every minute");
  });
});
