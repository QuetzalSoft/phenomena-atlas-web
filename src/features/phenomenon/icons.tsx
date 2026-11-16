/** Small stroke icons for row and block tools. Decorative: the buttons carry the label. */

const common = { viewBox: "0 0 20 20", width: 16, height: 16, fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

export function ArrowUpIcon() {
  return (
    <svg {...common}>
      <path d="M10 15V5M5.5 9.5 10 5l4.5 4.5" />
    </svg>
  );
}

export function ArrowDownIcon() {
  return (
    <svg {...common}>
      <path d="M10 5v10M5.5 10.5 10 15l4.5-4.5" />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg {...common}>
      <path d="M5 5l10 10M15 5 5 15" />
    </svg>
  );
}
