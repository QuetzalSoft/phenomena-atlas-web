// The editing operations of the region editor. Each one keeps the partition whole by
// construction: whatever area a region gains, its neighbours lose, so a change made only
// of these operations never opens a gap or an overlap. The API still checks every save.
//
// Geometry is GeoJSON as the contract defines it, longitude first. The overlays run in
// jsts, on the coordinates exactly as the API returned them, so a new border is computed
// once and shared by both regions on either side of it.

import "jsts/org/locationtech/jts/monkey.js";
import type Geometry from "jsts/org/locationtech/jts/geom/Geometry.js";
import GeoJSONReader from "jsts/org/locationtech/jts/io/GeoJSONReader.js";
import GeoJSONWriter from "jsts/org/locationtech/jts/io/GeoJSONWriter.js";
import Polygonizer from "jsts/org/locationtech/jts/operation/polygonize/Polygonizer.js";
import type { components } from "@quetzalsoft/phenomena-atlas-contract";

export type MultiPolygon = components["schemas"]["GeoJson.MultiPolygon"];
export type Position = [number, number];

/** A region as the editor holds it: one of the partition's, or one this draft created. */
export interface EditableRegion {
  /** Unique within the draft: `r<id>` for a saved region, `new-<n>` for one this draft created. */
  key: string;
  id?: number;
  name: string;
  population: number;
  municipalityCode: string;
  geometry: MultiPolygon;
}

export type OperationError =
  | "line_does_not_split"
  | "different_municipality"
  | "not_neighbours"
  | "invalid_area"
  | "area_outside_municipality"
  | "nothing_to_reassign";

export type OperationResult<T> = { ok: true; value: T } | { ok: false; error: OperationError };

const reader = new GeoJSONReader();
const writer = new GeoJSONWriter();

/** Pieces smaller than this, in square degrees (about 0.01 m² here), are overlay noise. */
const noiseArea = 1e-12;

const succeed = <T>(value: T): OperationResult<T> => ({ ok: true, value });
const failWith = <T>(error: OperationError): OperationResult<T> => ({ ok: false, error });

function read(geometry: object): Geometry {
  return reader.read(geometry);
}

/** The polygons of a jsts result, as a MultiPolygon, or undefined when nothing is left. */
function toMultiPolygon(geometry: Geometry): MultiPolygon | undefined {
  const coordinates: number[][][][] = [];
  for (const polygon of polygonsOf(geometry)) {
    coordinates.push(writer.write(polygon).coordinates as number[][][]);
  }
  return coordinates.length > 0 ? { type: "MultiPolygon", coordinates } : undefined;
}

function polygonsOf(geometry: Geometry): Geometry[] {
  const type = geometry.getGeometryType();
  if (type === "Polygon") {
    return geometry.getArea() > noiseArea ? [geometry] : [];
  }
  if (type === "MultiPolygon" || type === "GeometryCollection") {
    return Array.from({ length: geometry.getNumGeometries() }, (_, index) => polygonsOf(geometry.getGeometryN(index))).flat();
  }
  return [];
}

function unionAll(geometries: Geometry[]): Geometry | undefined {
  return geometries.reduce<Geometry | undefined>((union, geometry) => (union ? union.union(geometry) : geometry), undefined);
}

export function area(geometry: MultiPolygon): number {
  return read(geometry).getArea();
}

/**
 * Cuts a region along a line drawn across it. The largest piece stays with the region;
 * every other piece the line cut off goes to the new region. Parts of the region the line
 * does not touch stay where they are.
 */
export function splitRegion(region: MultiPolygon, line: Position[]): OperationResult<{ kept: MultiPolygon; cut: MultiPolygon }> {
  if (line.length < 2) {
    return failWith("line_does_not_split");
  }
  const knife = read({ type: "LineString", coordinates: line });
  const parts = polygonsOf(read(region));

  const untouched: Geometry[] = [];
  const pieces: Geometry[] = [];
  for (const part of parts) {
    if (!part.intersects(knife)) {
      untouched.push(part);
      continue;
    }
    // Every face the boundary and the line enclose, minus the faces that are holes.
    const polygonizer = new Polygonizer();
    polygonizer.add(part.getBoundary().union(knife));
    const faces = polygonizer.getPolygons().toArray().filter((face) => face.getArea() > noiseArea && part.contains(face.getInteriorPoint()));
    pieces.push(...(faces.length > 0 ? faces : [part]));
  }
  if (pieces.length < 2) {
    return failWith("line_does_not_split");
  }

  pieces.sort((a, b) => b.getArea() - a.getArea());
  const [largest, ...rest] = pieces as [Geometry, ...Geometry[]];
  const kept = toMultiPolygon(unionAll([largest, ...untouched]) as Geometry);
  const cut = toMultiPolygon(unionAll(rest) as Geometry);
  return kept && cut ? succeed({ kept, cut }) : failWith("line_does_not_split");
}

/** Joins two neighbouring regions of the same municipality into one shape. */
export function mergeRegions(a: EditableRegion, b: EditableRegion): OperationResult<MultiPolygon> {
  if (a.municipalityCode !== b.municipalityCode) {
    return failWith("different_municipality");
  }
  const [first, second] = [read(a.geometry), read(b.geometry)];
  if (!first.intersects(second)) {
    return failWith("not_neighbours");
  }
  const merged = toMultiPolygon(first.union(second));
  return merged ? succeed(merged) : failWith("not_neighbours");
}

export interface Reassignment {
  target: MultiPolygon;
  /** Neighbours that lost land, with what is left of them, or undefined when nothing is. */
  neighbours: { key: string; geometry: MultiPolygon | undefined }[];
}

/**
 * Gives the target region all the land inside a drawn area, within the target's own
 * municipality. Every neighbour inside the area loses that land; one that loses all of it
 * is left with nothing and has to be retired.
 */
export function reassignArea(
  ring: Position[],
  target: EditableRegion,
  regions: Iterable<EditableRegion>,
  municipality: MultiPolygon,
): OperationResult<Reassignment> {
  if (ring.length < 3) {
    return failWith("invalid_area");
  }
  const closed = [...ring, ring[0] as Position];
  const drawn = read({ type: "Polygon", coordinates: [closed] });
  if (!drawn.isValid()) {
    return failWith("invalid_area");
  }
  const within = drawn.intersection(read(municipality));
  if (polygonsOf(within).length === 0) {
    return failWith("area_outside_municipality");
  }

  const neighbours: Reassignment["neighbours"] = [];
  for (const region of regions) {
    if (region.key === target.key || region.municipalityCode !== target.municipalityCode) {
      continue;
    }
    const shape = read(region.geometry);
    if (!shape.intersects(within) || polygonsOf(shape.intersection(within)).length === 0) {
      continue;
    }
    neighbours.push({ key: region.key, geometry: toMultiPolygon(shape.difference(within)) });
  }
  if (neighbours.length === 0) {
    return failWith("nothing_to_reassign");
  }
  const grown = toMultiPolygon(read(target.geometry).union(within));
  return grown ? succeed({ target: grown, neighbours }) : failWith("nothing_to_reassign");
}

/** Splits a population between two pieces in proportion to their areas. */
export function splitPopulation(population: number, kept: MultiPolygon, cut: MultiPolygon): [number, number] {
  const [keptArea, cutArea] = [area(kept), area(cut)];
  const keptShare = Math.round((population * keptArea) / (keptArea + cutArea));
  return [keptShare, population - keptShare];
}
