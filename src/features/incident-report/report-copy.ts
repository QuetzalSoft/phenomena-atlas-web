import { RequestFailed } from "@/lib/api/request";

/** What to tell the person when the API refuses a report, by error code. */
export function failureCopy(error: unknown, fallback: string): string {
  if (!(error instanceof RequestFailed)) {
    return fallback;
  }
  if (error.status === undefined) {
    return "The API did not answer. Check your connection and try again.";
  }
  switch (error.code) {
    case "phenomenon_not_found":
      return "This phenomenon no longer accepts reports. Choose another one.";
    case "phenomenon_not_accepting_reports":
      return "This phenomenon is not published, so it accepts no reports.";
    case "region_not_found":
      return "That region is no longer part of the map. Choose the region again.";
    case "occurred_in_future":
      return "The day cannot be after today.";
    case "missing_characteristic_value":
      return "A required answer is missing.";
    case "unknown_characteristic":
    case "characteristic_retired":
    case "unknown_category_option":
    case "category_option_retired":
      return "The phenomenon changed while you were filling in the report. Reload the page and check your answers.";
    case "invalid_characteristic_value":
      return "One of the answers is not valid.";
    case "number_out_of_range":
      return "A number is outside the allowed range.";
    case "text_too_long":
      return "A text is too long.";
    case "invalid_request":
      return "Something in the report is not valid. Check your answers and try again.";
    case "unauthorized":
      return "Your session has expired. Sign in again to file the report.";
    case "invalid_cursor":
      return "The list changed. Reload the page.";
    default:
      return fallback;
  }
}
