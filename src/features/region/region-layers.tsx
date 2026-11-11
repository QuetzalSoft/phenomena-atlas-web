"use client";

import type { FeatureCollection, MultiPolygon as GeoJsonMultiPolygon } from "geojson";
import type { FilterSpecification } from "maplibre-gl";
import { useMemo } from "react";
import { Layer, Source } from "react-map-gl/maplibre";
import type { components } from "@quetzalsoft/phenomena-atlas-contract";
import type { EditableRegion, MultiPolygon } from "./partition-ops";
import { markColors, regionColor } from "./region-colors";

type MunicipalityCollection = components["schemas"]["MunicipalityCollection"];

/** Regions outlined in one colour, such as the ones a change touches. */
export interface RegionMark {
  keys: readonly string[];
  color: string;
  dashed?: boolean;
}

export const regionFillLayer = "regions-fill";

const keyIn = (keys: readonly string[]): FilterSpecification => ["in", ["get", "key"], ["literal", [...keys]]];

/**
 * The municipalities' borders and the regions, each filled in its own colour. Draw them
 * inside an AtlasMap; layers that should sit on top go after this.
 */
export function RegionLayers({
  regions,
  municipalities,
  selectedKey,
  marks = [],
  problemArea,
}: {
  regions: Iterable<EditableRegion>;
  municipalities: MunicipalityCollection | undefined;
  selectedKey?: string | undefined;
  marks?: RegionMark[];
  problemArea?: MultiPolygon | undefined;
}) {
  const regionData = useMemo<FeatureCollection<GeoJsonMultiPolygon>>(
    () => ({
      type: "FeatureCollection",
      features: Array.from(regions, (region) => ({
        type: "Feature",
        geometry: region.geometry as GeoJsonMultiPolygon,
        properties: { key: region.key, name: region.name, color: regionColor(region.key) },
      })),
    }),
    [regions],
  );

  return (
    <>
      <Source id="regions" type="geojson" data={regionData}>
        <Layer id={regionFillLayer} type="fill" paint={{ "fill-color": ["get", "color"], "fill-opacity": 0.4 }} />
        <Layer id="regions-outline" type="line" paint={{ "line-color": "#ffffff", "line-width": 0.8, "line-opacity": 0.85 }} />
        {marks.map((mark, index) => (
          <Layer
            key={index}
            id={`regions-mark-${index}`}
            type="line"
            filter={keyIn(mark.keys)}
            paint={{ "line-color": mark.color, "line-width": 2.5, ...(mark.dashed && { "line-dasharray": [2, 1] }) }}
          />
        ))}
        <Layer
          id="regions-selected-fill"
          type="fill"
          filter={["==", ["get", "key"], selectedKey ?? ""]}
          paint={{ "fill-color": markColors.selected, "fill-opacity": 0.25 }}
        />
        <Layer
          id="regions-selected-outline"
          type="line"
          filter={["==", ["get", "key"], selectedKey ?? ""]}
          paint={{ "line-color": markColors.selected, "line-width": 3 }}
        />
      </Source>
      {municipalities && (
        <Source id="municipalities" type="geojson" data={municipalities as unknown as FeatureCollection}>
          <Layer id="municipalities-border" type="line" paint={{ "line-color": "#16191f", "line-width": 2.2, "line-opacity": 0.75 }} />
        </Source>
      )}
      {problemArea && (
        <Source id="problem-area" type="geojson" data={{ type: "Feature", geometry: problemArea as GeoJsonMultiPolygon, properties: {} }}>
          <Layer id="problem-area-fill" type="fill" paint={{ "fill-color": markColors.problem, "fill-opacity": 0.55 }} />
          <Layer id="problem-area-outline" type="line" paint={{ "line-color": markColors.problem, "line-width": 2 }} />
        </Source>
      )}
    </>
  );
}

/** The bounding box of some multipolygons, as MapLibre takes it: west, south, east, north. */
export function boundsOf(geometries: Iterable<MultiPolygon>): [number, number, number, number] | undefined {
  let bounds: [number, number, number, number] | undefined;
  for (const geometry of geometries) {
    for (const polygon of geometry.coordinates) {
      for (const [longitude, latitude] of polygon[0] ?? []) {
        if (longitude === undefined || latitude === undefined) {
          continue;
        }
        bounds = bounds
          ? [Math.min(bounds[0], longitude), Math.min(bounds[1], latitude), Math.max(bounds[2], longitude), Math.max(bounds[3], latitude)]
          : [longitude, latitude, longitude, latitude];
      }
    }
  }
  return bounds;
}
