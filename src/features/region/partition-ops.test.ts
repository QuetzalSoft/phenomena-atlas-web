import { describe, expect, it } from "vitest";
import {
  area,
  type EditableRegion,
  mergeRegions,
  type MultiPolygon,
  reassignArea,
  splitPopulation,
  splitRegion,
} from "./partition-ops";

const box = (west: number, south: number, east: number, north: number): MultiPolygon => ({
  type: "MultiPolygon",
  coordinates: [
    [
      [
        [west, south],
        [east, south],
        [east, north],
        [west, north],
        [west, south],
      ],
    ],
  ],
});

const region = (key: string, geometry: MultiPolygon, municipalityCode = "14039"): EditableRegion => ({
  key,
  name: key,
  population: 0,
  municipalityCode,
  geometry,
});

/** Areas are compared to this many decimals of a square degree. */
const precision = 12;

describe("splitting a region", () => {
  it("keeps the larger piece and cuts off the other", () => {
    const result = splitRegion(box(0, 0, 3, 1), [
      [1, -1],
      [1, 2],
    ]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(area(result.value.kept)).toBeCloseTo(2, precision);
      expect(area(result.value.cut)).toBeCloseTo(1, precision);
    }
  });

  it("refuses a line that does not cross the region", () => {
    expect(splitRegion(box(0, 0, 3, 1), [[5, 5], [6, 6]])).toEqual({ ok: false, error: "line_does_not_split" });
    expect(splitRegion(box(0, 0, 3, 1), [[1, -1], [1, 0.5]])).toEqual({ ok: false, error: "line_does_not_split" });
  });

  it("leaves parts of the region the line does not touch with the region", () => {
    const twoParts: MultiPolygon = { type: "MultiPolygon", coordinates: [...box(0, 0, 1, 1).coordinates, ...box(5, 0, 6, 1).coordinates] };

    const result = splitRegion(twoParts, [[0.25, -1], [0.25, 2]]);

    expect(result.ok && [area(result.value.kept), area(result.value.cut)]).toEqual([1.75, 0.25]);
  });
});

describe("merging regions", () => {
  it("joins two neighbours into one shape", () => {
    const result = mergeRegions(region("a", box(0, 0, 1, 1)), region("b", box(1, 0, 2, 1)));

    expect(result.ok && area(result.value)).toBeCloseTo(2, precision);
    expect(result.ok && result.value.coordinates).toHaveLength(1);
  });

  it("refuses regions that do not touch, or lie in different municipalities", () => {
    expect(mergeRegions(region("a", box(0, 0, 1, 1)), region("b", box(3, 0, 4, 1)))).toEqual({ ok: false, error: "not_neighbours" });
    expect(mergeRegions(region("a", box(0, 0, 1, 1)), region("b", box(1, 0, 2, 1), "14120"))).toEqual({
      ok: false,
      error: "different_municipality",
    });
  });
});

describe("reassigning an area", () => {
  const municipality = box(0, 0, 3, 1);
  const regions = [region("a", box(0, 0, 1, 1)), region("b", box(1, 0, 2, 1)), region("c", box(2, 0, 3, 1))];
  const [a] = regions as [EditableRegion];

  it("moves the land inside the area to the target, and clips the neighbours", () => {
    const result = reassignArea([[0.5, -1], [1.5, -1], [1.5, 2], [0.5, 2]], a, regions, municipality);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(area(result.value.target)).toBeCloseTo(1.5, precision);
      expect(result.value.neighbours.map(({ key, geometry }) => [key, geometry && area(geometry)])).toEqual([["b", 0.5]]);
    }
  });

  it("leaves a neighbour with nothing when the area covers it whole", () => {
    const result = reassignArea([[0.5, -1], [2.5, -1], [2.5, 2], [0.5, 2]], a, regions, municipality);

    expect(result.ok && result.value.neighbours.map(({ key, geometry }) => [key, geometry === undefined])).toEqual([
      ["b", true],
      ["c", false],
    ]);
  });

  it("refuses areas outside the municipality, crossing themselves, or taking nothing", () => {
    expect(reassignArea([[5, 5], [6, 5], [6, 6]], a, regions, municipality)).toEqual({ ok: false, error: "area_outside_municipality" });
    expect(reassignArea([[0, 0], [1, 1], [1, 0], [0, 1]], a, regions, municipality)).toEqual({ ok: false, error: "invalid_area" });
    expect(reassignArea([[0.1, 0.1], [0.9, 0.1], [0.9, 0.9]], a, regions, municipality)).toEqual({ ok: false, error: "nothing_to_reassign" });
  });

  it("never reaches into another municipality", () => {
    const other = region("z", box(3, 0, 4, 1), "14120");

    const result = reassignArea([[2.5, 0.2], [3.5, 0.2], [3.5, 0.8], [2.5, 0.8]], regions[2] as EditableRegion, [...regions, other], municipality);

    expect(result).toEqual({ ok: false, error: "nothing_to_reassign" });
  });
});

describe("splitting a population", () => {
  it("shares it by area, and adds up to the original", () => {
    expect(splitPopulation(101, box(0, 0, 3, 1), box(3, 0, 4, 1))).toEqual([76, 25]);
  });
});
