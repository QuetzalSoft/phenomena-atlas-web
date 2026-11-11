import { RequestFailed } from "@/lib/api/request";
import type { OperationError } from "./partition-ops";

/** What the admin reads when an editing operation cannot be applied. */
export function operationCopy(error: OperationError): string {
  switch (error) {
    case "line_does_not_split":
      return "The line has to cross the region from one side to the other.";
    case "different_municipality":
      return "Regions in different municipalities cannot be merged.";
    case "not_neighbours":
      return "Only neighbouring regions can be merged.";
    case "invalid_area":
      return "The area crosses itself. Draw it again without crossing lines.";
    case "area_outside_municipality":
      return "The area has to cover part of the region's municipality.";
    case "nothing_to_reassign":
      return "The area takes no land from another region.";
  }
}

/** What the admin reads when the API refuses a save or a read. Chosen by code, never by message. */
export function failureCopy(error: unknown, fallback: string): string {
  if (!(error instanceof RequestFailed)) {
    return fallback;
  }
  if (error.status === undefined) {
    return "The API did not answer. Check your connection and try again.";
  }
  switch (error.code) {
    case "partition_version_conflict":
      return "Someone saved a newer version while you were editing. Load it to continue; your unsaved changes will be lost.";
    case "empty_change":
      return "There is nothing to save.";
    case "duplicate_region_in_change":
      return "A region appears twice in the change. Discard your changes and make them again.";
    case "region_not_found":
      return "A region in your change no longer exists. Load the latest version and make your changes again.";
    case "invalid_geometry":
      return "A region's shape is not valid. It is outlined in red.";
    case "region_crosses_municipality":
      return "A region reaches into another municipality. The part across the border is shown in red.";
    case "region_out_of_area":
      return "A region reaches outside the metropolitan area. The part outside is shown in red.";
    case "region_overlap":
      return "Two regions overlap. The overlap is shown in red.";
    case "partition_gap":
      return "Part of a municipality is left without a region. The gap is shown in red.";
    case "partition_not_loaded":
      return "The regions have not been loaded yet. An operator has to run the initial load.";
    case "partition_version_not_found":
      return "That version does not exist.";
    case "unauthorized":
      return "Your session has expired.";
    case "forbidden":
      return "You no longer have the admin role. Reload the page.";
    default:
      return fallback;
  }
}
