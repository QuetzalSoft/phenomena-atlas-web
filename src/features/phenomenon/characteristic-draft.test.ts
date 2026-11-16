import { describe, expect, it } from "vitest";
import { keyFromLabel, keyPattern, uniqueKey, withType, type Characteristic } from "./characteristic-draft";

describe("keys", () => {
  it("are derived from labels the way the API accepts them", () => {
    expect(keyFromLabel("Number of victims")).toBe("number_of_victims");
    expect(keyFromLabel("¿Hubo arma?")).toBe("hubo_arma");
    expect(keyFromLabel("Daño económico (MXN)")).toBe("dano_economico_mxn");
    expect(keyFromLabel("2nd visit")).toBe("k_2nd_visit");
    expect(keyFromLabel("  ")).toBe("");
    for (const label of ["Number of victims", "2nd visit", "a".repeat(80)]) {
      expect(keyFromLabel(label)).toMatch(keyPattern);
    }
  });

  it("never repeat one already taken", () => {
    expect(uniqueKey("Victims", ["victims", "victims_2"], "characteristic")).toBe("victims_3");
    expect(uniqueKey("", [], "option_1")).toBe("option_1");
  });
});

describe("changing the type of a new characteristic", () => {
  it("keeps the fields every type shares and resets the rest", () => {
    const yesNo: Characteristic = { type: "boolean", key: "weapon", label: "Weapon", description: "Any weapon", required: true, retired: false };
    const category = withType(yesNo, "category");
    expect(category).toMatchObject({ type: "category", key: "weapon", label: "Weapon", description: "Any weapon", required: true });
    expect(category.type === "category" && category.options).toHaveLength(1);
    expect(withType(category, "text")).toEqual({ ...yesNo, type: "text", maxLength: 500 });
  });
});
