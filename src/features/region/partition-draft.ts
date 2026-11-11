// The unsaved changes an admin makes to the region partition, kept in the browser until
// they are saved as one new version. Plain data, so it is easy to test and to reason about.

import type { components } from "@quetzalsoft/phenomena-atlas-contract";
import type { EditableRegion } from "./partition-ops";

export type RegionPartition = components["schemas"]["RegionPartition"];
export type PartitionChange = components["schemas"]["PartitionChange"];

export interface PartitionDraft {
  /** The version the draft started from, sent as `baseVersion`. */
  baseVersion: number;
  regions: ReadonlyMap<string, EditableRegion>;
  /** Keys of regions this draft created or changed, in the order they were first touched. */
  edited: readonly string[];
  /** Saved regions this draft retires. */
  retired: readonly number[];
  /** How many regions this draft has created, to number the next one. */
  created: number;
}

export const savedKey = (id: number) => `r${id}`;

export function draftFrom(partition: RegionPartition): PartitionDraft {
  return {
    baseVersion: partition.version,
    regions: new Map(
      partition.features.map((feature) => [
        savedKey(feature.id),
        {
          key: savedKey(feature.id),
          id: feature.id,
          name: feature.properties.name,
          population: feature.properties.population,
          municipalityCode: feature.properties.municipalityCode,
          geometry: feature.geometry,
        },
      ]),
    ),
    edited: [],
    retired: [],
    created: 0,
  };
}

export interface DraftEdit {
  /** Regions to put in the draft as given, new or changed. */
  upsert?: EditableRegion[];
  /** Regions to take out: saved ones are retired, new ones simply dropped. */
  remove?: string[];
}

export function applyEdit(draft: PartitionDraft, { upsert = [], remove = [] }: DraftEdit): PartitionDraft {
  const regions = new Map(draft.regions);
  const edited = [...draft.edited];
  const retired = [...draft.retired];
  for (const region of upsert) {
    regions.set(region.key, region);
    if (!edited.includes(region.key)) {
      edited.push(region.key);
    }
  }
  for (const key of remove) {
    const region = regions.get(key);
    regions.delete(key);
    const position = edited.indexOf(key);
    if (position >= 0) {
      edited.splice(position, 1);
    }
    if (region?.id !== undefined && !retired.includes(region.id)) {
      retired.push(region.id);
    }
  }
  return { ...draft, regions, edited, retired };
}

/** A key for the next region this draft creates. */
export function nextNewKey(draft: PartitionDraft): { key: string; draft: PartitionDraft } {
  const created = draft.created + 1;
  return { key: `new-${created}`, draft: { ...draft, created } };
}

export function hasChanges(draft: PartitionDraft): boolean {
  return draft.edited.length > 0 || draft.retired.length > 0;
}

/**
 * The draft as the change the API takes. `keys` lists the region key behind each entry of
 * `regions`, so errors that point at a position can be traced back to a region.
 */
export function toChange(draft: PartitionDraft): { change: PartitionChange; keys: string[] } {
  const regions = draft.edited.flatMap((key) => {
    const region = draft.regions.get(key);
    return region ? [region] : [];
  });
  return {
    change: {
      baseVersion: draft.baseVersion,
      regions: regions.map((region) => ({
        ...(region.id !== undefined && { id: region.id }),
        name: region.name,
        population: region.population,
        municipalityCode: region.municipalityCode,
        geometry: region.geometry,
      })),
      retiredRegionIds: [...draft.retired],
    },
    keys: regions.map((region) => region.key),
  };
}
