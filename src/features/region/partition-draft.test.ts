import { describe, expect, it } from "vitest";
import { applyEdit, draftFrom, hasChanges, nextNewKey, type RegionPartition, toChange } from "./partition-draft";

const square = { type: "MultiPolygon" as const, coordinates: [[[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]] };

const partition: RegionPartition = {
  type: "FeatureCollection",
  version: 4,
  createdAt: "2026-11-11T00:00:00Z",
  features: [1, 2].map((id) => ({
    type: "Feature",
    id,
    geometry: square,
    properties: { name: `Region ${id}`, population: 10 * id, municipalityCode: "14039" },
  })),
};

describe("a partition draft", () => {
  it("starts with no changes, based on the partition's version", () => {
    const draft = draftFrom(partition);

    expect(hasChanges(draft)).toBe(false);
    expect(toChange(draft).change).toEqual({ baseVersion: 4, regions: [], retiredRegionIds: [] });
  });

  it("sends changed and new regions, and retires removed saved ones", () => {
    let draft = draftFrom(partition);
    const first = draft.regions.get("r1")!;
    const created = nextNewKey(draft);
    draft = applyEdit(created.draft, {
      upsert: [{ ...first, name: "Renamed" }, { key: created.key, name: "New", population: 0, municipalityCode: "14039", geometry: square }],
      remove: ["r2"],
    });

    const { change, keys } = toChange(draft);

    expect(keys).toEqual(["r1", "new-1"]);
    expect(change.regions.map((region) => [region.id, region.name])).toEqual([
      [1, "Renamed"],
      [undefined, "New"],
    ]);
    expect(change.retiredRegionIds).toEqual([2]);
  });

  it("drops a new region it removes, retiring nothing", () => {
    const created = nextNewKey(draftFrom(partition));
    let draft = applyEdit(created.draft, {
      upsert: [{ key: created.key, name: "New", population: 0, municipalityCode: "14039", geometry: square }],
    });
    draft = applyEdit(draft, { remove: [created.key] });

    expect(hasChanges(draft)).toBe(false);
  });
});
