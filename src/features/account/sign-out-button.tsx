import ui from "@/components/ui.module.css";

/** A form, so signing out is a POST and a link elsewhere cannot do it. */
export function SignOutButton() {
  return (
    <form action="/auth/sign-out" method="post">
      <button type="submit" className={ui.button}>Sign out</button>
    </form>
  );
}
