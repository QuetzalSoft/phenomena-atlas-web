import { RequestFailed } from "@/lib/api/request";

/**
 * What to tell someone whose edit of account details was refused. Nothing was changed in any
 * of these cases, and the copy says so where it matters.
 */
export function profileFailureCopy(error: RequestFailed): string {
  if (error.status === undefined) {
    return "The API did not answer. Check your connection and try again.";
  }
  switch (error.code) {
    case "email_already_in_use":
      return "Another account already uses that email. Use a different one.";
    case "invalid_account_details":
    case "invalid_request":
      return "The details were not accepted. Check the names and the email, and try again.";
    case "account_update_unavailable":
      return "The details could not be updated right now. Nothing was changed. Try again.";
    case "account_not_found":
      return "This account no longer exists. Reload the page.";
    case "unauthorized":
      // The form puts a link to sign in again after it.
      return "Your session has expired.";
    case "forbidden":
      return "You are not allowed to change these details.";
    default:
      return "The details could not be updated. Try again.";
  }
}
