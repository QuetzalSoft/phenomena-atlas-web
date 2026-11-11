import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const config = [
  { ignores: [".next/", "next-env.d.ts", "playwright-report/", "test-results/"] },
  ...nextCoreWebVitals,
  ...nextTypescript,
  // Keep the Next.js server from becoming a backend. See docs/architecture.md.
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: ["pg", "kysely", "postgres"].map((name) => ({ name, message: "Only the API talks to the database." })),
      }],
      "no-restricted-globals": ["error", {
        name: "fetch", message: "Call the API through src/lib/api, which is typed by the contract.",
      }],
      "no-restricted-syntax": ["error", {
        selector: "ExpressionStatement[directive='use server']",
        message: "No server actions: the web server is not a backend.",
      }],
    },
  },
  // The mock API stands in for the real one in end-to-end tests; it is not part of the app.
  {
    files: ["tests/**/*.ts"],
    rules: { "no-restricted-globals": "off" },
  },
];

export default config;
