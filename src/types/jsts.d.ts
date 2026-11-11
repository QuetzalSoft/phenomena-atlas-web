// jsts ships no type declarations. These cover only what src/features/region uses. The
// geometry methods come from jsts/org/locationtech/jts/monkey.js, which adds them to the
// Geometry prototype when imported.

declare module "jsts/org/locationtech/jts/monkey.js";

declare module "jsts/org/locationtech/jts/geom/Geometry.js" {
  export default interface Geometry {
    getGeometryType(): string;
    getArea(): number;
    isEmpty(): boolean;
    isValid(): boolean;
    getBoundary(): Geometry;
    getInteriorPoint(): Geometry;
    getEnvelopeInternal(): { getMinX(): number; getMinY(): number; getMaxX(): number; getMaxY(): number };
    contains(other: Geometry): boolean;
    intersects(other: Geometry): boolean;
    union(other: Geometry): Geometry;
    difference(other: Geometry): Geometry;
    intersection(other: Geometry): Geometry;
    getNumGeometries(): number;
    getGeometryN(index: number): Geometry;
    buffer(distance: number): Geometry;
  }
}

declare module "jsts/org/locationtech/jts/io/GeoJSONReader.js" {
  import type Geometry from "jsts/org/locationtech/jts/geom/Geometry.js";
  export default class GeoJSONReader {
    read(geometry: object): Geometry;
  }
}

declare module "jsts/org/locationtech/jts/io/GeoJSONWriter.js" {
  import type Geometry from "jsts/org/locationtech/jts/geom/Geometry.js";
  export default class GeoJSONWriter {
    write(geometry: Geometry): { type: string; coordinates: unknown };
  }
}

declare module "jsts/org/locationtech/jts/operation/polygonize/Polygonizer.js" {
  import type Geometry from "jsts/org/locationtech/jts/geom/Geometry.js";
  export default class Polygonizer {
    add(geometry: Geometry): void;
    getPolygons(): { toArray(): Geometry[] };
  }
}
