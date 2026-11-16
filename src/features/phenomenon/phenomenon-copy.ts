import type { components } from "@quetzalsoft/phenomena-atlas-contract";
import { RequestFailed } from "@/lib/api/request";

type Status = components["schemas"]["PhenomenonStatus"];

export const statusInfo: Record<Status, { label: string; explanation: string }> = {
  draft: { label: "Draft", explanation: "Only admins can see it, and it accepts no reports yet." },
  published: { label: "Published", explanation: "Everyone can see it, and it accepts reports." },
  archived: { label: "Archived", explanation: "Only admins can see it. Its reports are kept, and it accepts no new ones." },
};

/** What to tell the admin when the API refuses a phenomenon change, by error code. */
export function failureCopy(error: unknown, fallback: string): string {
  if (!(error instanceof RequestFailed)) {
    return fallback;
  }
  if (error.status === undefined) {
    return "The API did not answer. Check your connection and try again.";
  }
  switch (error.code) {
    case "phenomenon_revision_conflict":
      return "Another admin changed this phenomenon after you opened it. Load their version to continue; your changes here will be lost.";
    case "phenomenon_not_found":
      return "This phenomenon no longer exists.";
    case "invalid_status_transition":
      return "The phenomenon cannot change to that status. Reload the page.";
    case "phenomenon_not_draft":
      return "Only a draft can be deleted. Archive it instead.";
    case "duplicate_characteristic_key":
      return "Two characteristics have the same key.";
    case "duplicate_category_option_key":
      return "Two options of a category have the same key.";
    case "category_without_options":
      return "A category needs at least one option that is not retired.";
    case "invalid_number_range":
      return "A number's minimum is above its maximum.";
    case "characteristic_removed":
      return "A saved characteristic is missing. Saved characteristics can only be retired.";
    case "category_option_removed":
      return "A saved option is missing. Saved options can only be retired.";
    case "characteristic_type_changed":
      return "The type of a saved characteristic cannot change.";
    case "unknown_characteristic":
      return "The weighting function uses a characteristic that does not exist.";
    case "characteristic_retired":
      return "The weighting function uses a retired characteristic.";
    case "characteristic_not_aggregable":
      return "The weighting function aggregates a text or date characteristic.";
    case "invalid_aggregate":
      return "An aggregate in the weighting function is missing its characteristic.";
    case "weighting_function_too_large":
      return "The weighting function is too large.";
    case "incomplete_weighting_function":
      return "The weighting function has a part to fill in. A published phenomenon needs a complete function.";
    case "unauthorized":
      return "Your session has expired.";
    case "forbidden":
      return "You no longer have the admin role. Reload the page.";
    default:
      return fallback;
  }
}
