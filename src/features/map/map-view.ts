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
