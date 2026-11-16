import type { components } from "@quetzalsoft/phenomena-atlas-contract";

export type Characteristic = components["schemas"]["Characteristic"];
export type CharacteristicType = Characteristic["type"];
export type CategoryOption = components["schemas"]["CategoryOption"];

export const characteristicTypeInfo: Record<CharacteristicType, { label: string; usableInFunction: boolean; description: string }> = {
  number: { label: "Number", usableInFunction: true, description: "A quantity, such as the number of victims." },
  boolean: { label: "Yes / no", usableInFunction: true, description: "Counts as 1 for yes and 0 for no." },
  category: { label: "Category", usableInFunction: true, description: "One of a list of options, each with a weight." },
  text: { label: "Text", usableInFunction: false, description: "Free text. Not usable in the weighting function." },
  date: { label: "Date", usableInFunction: false, description: "A calendar date. Not usable in the weighting function." },
};

export const characteristicTypes = Object.keys(characteristicTypeInfo) as CharacteristicType[];

/** What the API accepts as a key: lowercase letters, digits and underscores, from a letter, at most 40. */
export const keyPattern = /^[a-z][a-z0-9_]{0,39}$/;

/**
 * A key derived from a label: `Number of victims` becomes `number_of_victims`. Accents are
 * dropped, and a label that starts with a digit gets a leading letter.
 */
export function keyFromLabel(label: string): string {
  const key = label
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40)
    .replace(/_+$/, "");
  if (key === "") {
    return "";
  }
  return /^[a-z]/.test(key) ? key : `k_${key}`.slice(0, 40);
}

/** A key derived from `label` that none of `taken` has, adding `_2`, `_3`... as needed. */
export function uniqueKey(label: string, taken: Iterable<string>, fallback: string): string {
  const used = new Set(taken);
  const base = keyFromLabel(label) || fallback;
  if (!used.has(base)) {
    return base;
  }
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base.slice(0, 40 - String(suffix).length - 1)}_${suffix}`;
    if (!used.has(candidate)) {
      return candidate;
    }
  }
}

/** A new characteristic of `type`, keeping what the previous one shared with every type. */
export function withType(characteristic: Characteristic, type: CharacteristicType): Characteristic {
  const fields = {
    key: characteristic.key,
    label: characteristic.label,
    ...(characteristic.description !== undefined && { description: characteristic.description }),
    required: characteristic.required,
    retired: characteristic.retired,
  };
  switch (type) {
    case "number":
      return { type, ...fields, integer: false };
    case "boolean":
      return { type, ...fields };
    case "category":
      return { type, ...fields, options: [{ key: "option_1", label: "Option 1", weight: 1, retired: false }] };
    case "text":
      return { type, ...fields, maxLength: 500 };
    case "date":
      return { type, ...fields };
  }
}

export function newCharacteristic(taken: Iterable<string>): Characteristic {
  return withType({ type: "boolean", key: uniqueKey("", taken, "characteristic"), label: "", required: false, retired: false }, "number");
}

export function newOption(options: readonly CategoryOption[]): CategoryOption {
  const position = options.length + 1;
  return {
    key: uniqueKey("", options.map((option) => option.key), `option_${position}`),
    label: "",
    weight: position,
    retired: false,
  };
}

/** A copy of `value` without `key`, for clearing an optional field. */
export function without<T extends object, K extends keyof T>(value: T, key: K): Omit<T, K> {
  const copy = { ...value };
  delete copy[key];
  return copy;
}
