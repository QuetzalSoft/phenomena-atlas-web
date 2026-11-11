"use client";

import dynamic from "next/dynamic";

/**
 * The map, loaded only in the browser. MapLibre needs `window` and WebGL, and `ssr: false`
 * is only allowed in a client file, so pages use this rather than atlas-map directly.
 */
export const AtlasMapLazy = dynamic(() => import("./atlas-map"), { ssr: false });
