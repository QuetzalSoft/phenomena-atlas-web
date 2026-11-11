/**
 * Fill colours for regions: distinct, mid-tone hues that stay readable under a 40 % fill on
 * both light and dark basemaps. A region keeps its colour across saves, as it is picked by
 * id; new regions, which have none yet, by their draft key.
 */
const palette = ["#3b82c4", "#d9822b", "#3a9d6f", "#c44e7a", "#7b61c9", "#b59a1e", "#2a9bb0", "#c5523d", "#6c8f3a", "#8a6bb0"];

export function regionColor(key: string): string {
  let hash = 0;
  for (const char of key) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return palette[hash % palette.length] as string;
}

/** Mark colours, matching the --ok, --warn, --danger and --accent tokens in globals.css. */
export const markColors = {
  added: "#16794a",
  changed: "#a5560b",
  problem: "#b4232c",
  selected: "#2856d9",
};
