"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { setWorkerUrl, type StyleSpecification } from "maplibre-gl";
import { Map, type MapProps, type MapRef } from "react-map-gl/maplibre";
import type { Ref } from "react";

// MapLibre loads its worker relative to its own module, which bundling breaks: without this
// the map stays blank with "Worker failed to load". See docs/architecture.md.
setWorkerUrl(new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).href);

/** A plain background, for when no basemap is configured. Data layers still render on it. */
const blankStyle: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: "background", type: "background", paint: { "background-color": "#eef0f3" } }],
};

/** The basemap. The tile provider is configuration, so changing it changes no code. */
const mapStyle = process.env.NEXT_PUBLIC_MAP_STYLE_URL || blankStyle;

declare global {
  interface Window {
    /** The last map loaded, exposed to end-to-end tests only so they can turn coordinates into clicks. */
    __atlasMap?: MapRef["getMap"] extends () => infer M ? M : never;
  }
}

export type AtlasMapProps = Omit<MapProps, "mapStyle"> & { ref?: Ref<MapRef> };

/** The atlas's map: MapLibre with the configured basemap. Children are sources, layers and controls. */
export default function AtlasMap({ onLoad, ...props }: AtlasMapProps) {
  return (
    <Map
      {...props}
      mapStyle={mapStyle}
      onLoad={(event) => {
        if (process.env.NEXT_PUBLIC_E2E === "true") {
          window.__atlasMap = event.target;
        }
        onLoad?.(event);
      }}
    />
  );
}
