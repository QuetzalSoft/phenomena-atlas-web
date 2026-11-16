import { parseAsFloat } from "nuqs";

/** The map view in the URL, so a view can be shared and survives a reload. */
export const mapViewParsers = {
  lng: parseAsFloat,
  lat: parseAsFloat,
  zoom: parseAsFloat,
};

/** Rounded so the URL stays readable: five decimals is about a metre. */
export function roundView(view: { longitude: number; latitude: number; zoom: number }) {
  return {
    lng: Math.round(view.longitude * 1e5) / 1e5,
    lat: Math.round(view.latitude * 1e5) / 1e5,
    zoom: Math.round(view.zoom * 100) / 100,
  };
}

/**
 * Writes the view into the URL of `pathname`, right away and only while the browser is still
 * there. A delayed write could land on the page the user just opened instead.
 */
export function replaceViewInUrl(pathname: string, view: { longitude: number; latitude: number; zoom: number }) {
  const url = new URL(window.location.href);
  if (url.pathname !== pathname) {
    return;
  }
  for (const [key, value] of Object.entries(roundView(view))) {
    url.searchParams.set(key, String(value));
  }
  window.history.replaceState(window.history.state, "", url);
}
