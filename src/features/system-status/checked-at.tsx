"use client";

/** Shows when a check ran in the viewer's own time zone. The server renders it in its own. */
export function CheckedAt({ iso }: { iso: string }) {
  return (
    <time dateTime={iso} suppressHydrationWarning>
      {new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
    </time>
  );
}
