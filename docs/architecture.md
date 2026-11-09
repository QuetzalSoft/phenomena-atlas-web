# Web architecture

How this client is structured internally. How it fits into the product is in
`docs/architecture.md` in the system repository, and why this stack was chosen is in
ADR 0007 there.

This document describes the target. There is no application code yet, so nothing here
exists until the first real commit builds it. The snippets below come from a prototype
that was verified to work, and are the starting point for that commit.

## Sources and precedence

The contract and accepted ADRs in the system repository win over this document and over
any framework convention. When Next.js documentation suggests something they forbid, such
as reading data in a server action, the contract and the ADRs win.

## Stack

| Concern | Choice |
|---|---|
| Runtime | Node.js, active LTS |
| Package manager | Bun, for installing and running scripts only |
| Framework | Next.js with the App Router |
| UI | React |
| Language | TypeScript 6 (see [Enforcement](#enforcement) for why not 7) |
| Map | MapLibre GL JS through `react-map-gl/maplibre` |
| API client | `openapi-fetch`, typed by `@quetzalsoft/phenomena-atlas-contract` |
| Client-side data | TanStack Query through `openapi-react-query` |
| URL state | `nuqs` |
| Lint | ESLint with `eslint-config-next` |
| Unit and component tests | Vitest and Testing Library |
| End-to-end tests | Playwright |

Versions verified together in the prototype: Next.js 16.4, React 19.3, `react-map-gl` 8.1,
MapLibre GL JS 6.17, `openapi-fetch` 0.17, `openapi-react-query` 0.5, TanStack Query 5,
`nuqs` 2.10, Node 26.13.

## Rendering model

Next.js runs code in two places, and every component belongs to exactly one of them.

- **Server Components** are the default. They render pages that need to be indexed or
  shared, such as a phenomenon's page, and produce its metadata (title, description,
  preview image) from API data. They call the API through the typed client.
- **Client Components** are marked with `"use client"`. They hold interaction: the map,
  filters, anything that reacts to input. They read data through TanStack Query.

A page usually combines both: a Server Component fetches what the first render needs and
passes it as props, and Client Components take over from there.

## The Next.js server is not a backend

The API is the only component with database access and the only place domain rules are
enforced. The Next.js server is one more client of the API, with the same rights as a
browser.

- **No database access.** No driver, no ORM, no connection string in this repository.
- **No server actions.** Writes go from the client to the API through the typed client.
- **Route handlers only for concerns without domain data**, such as a liveness probe or a
  generated preview image built from API responses. A route handler that reshapes,
  combines or caches API data on behalf of the client is a second backend. Needing one
  means the contract is missing something.
- **No domain rules.** Validation in a form is for the user's convenience. The API is what
  enforces it.

[Enforcement](#enforcement) catches the obvious violations. Code review catches the rest.

## Talking to the API

There is one client, in `src/lib/api/`, and every call goes through it:

```ts
import createClient from "openapi-fetch";
import createQueryClient from "openapi-react-query";
import type { paths } from "@quetzalsoft/phenomena-atlas-contract";

export const api = createClient<paths>({
  baseUrl: typeof window === "undefined" ? process.env.API_URL : process.env.NEXT_PUBLIC_API_URL,
});

export const $api = createQueryClient(api);
```

- On the server, call `api.GET(...)` directly in a Server Component.
- In the browser, use `$api.useQuery(...)` and `$api.useMutation(...)`.
- Paths, parameters and response fields are all checked against the pinned contract. A
  path the contract does not declare does not compile.
- `API_URL` is read on the server and `NEXT_PUBLIC_API_URL` in the browser. They differ
  when the server reaches the API over an internal network.

Failures come back as the contract's `Error` shape. Branch on `code`, never on `message`,
and show the user copy written in this repository, not the API's message.

## The map

The map is a Client Component under `src/features/map/`. MapLibre needs `window` and
WebGL, so it must never render on the server.

**Load it through a client wrapper.** `next/dynamic` with `ssr: false` is rejected inside a
Server Component, and the build fails. Put the dynamic import in its own client file and
use that from pages:

```tsx
"use client";
import dynamic from "next/dynamic";

// MapLibre needs window and WebGL, so it never renders on the server.
export const AtlasMapLazy = dynamic(() => import("./atlas-map"), { ssr: false });
```

**Set the worker URL.** MapLibre 6 loads its worker from a path relative to its own
module, which bundling breaks. Without this the map renders blank and the console shows
"Worker failed to load". Set it once, in the module that imports MapLibre:

```ts
import { setWorkerUrl } from "maplibre-gl";

setWorkerUrl(new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).href);
```

Re-check this after every Next.js or MapLibre upgrade. The end-to-end suite loads a real
map so that a regression fails there.

**Feed contract GeoJSON straight in.** The contract's geometries follow RFC 7946,
longitude first, and so does MapLibre. Pass API data to `<Source type="geojson">` as is.
Never swap coordinates. If something appears in the wrong place, the data is wrong, not
the order.

**Styling.** Data layers are `<Layer>` components with paint properties defined in code
next to the feature that owns them. The basemap is a MapLibre style loaded from
`NEXT_PUBLIC_MAP_STYLE_URL`, so changing the tile provider changes no code. Import
`maplibre-gl/dist/maplibre-gl.css` in the map component.

**The view lives in the URL.** Longitude, latitude and zoom are search parameters managed
with `nuqs`, updated with `history: "replace"` when a move ends. A shared link opens the same
view, and a reload keeps it.

## Directory layout

Routes stay thin, and code is grouped by feature.

```
app/                        routes only: pages, layouts, metadata
  layout.tsx
  providers.tsx             QueryClientProvider and the nuqs adapter
  page.tsx
  phenomena/
    [id]/
      page.tsx
src/
  lib/
    api/                    the typed client, the only way to reach the API
  features/
    map/
      atlas-map.tsx
      atlas-map-lazy.tsx
    phenomenon/
      phenomenon-summary.tsx
  components/               shared presentational components with no data access
tests/
  e2e/
```

`phenomenon` is an illustration of the layout. Feature folders are named after terms in
`docs/domain.md` in the system repository, which does not define them yet.

## Testing

- **Component tests** use Vitest and Testing Library, and cover behaviour, not markup.
- **End-to-end tests** use Playwright against a production build (`next build` and
  `next start`). The API is replaced by a mock server whose handlers are typed with the
  contract's `paths`, so a mock that drifts from the contract fails to compile.
- **The map is tested for real.** At least one end-to-end test waits for the map canvas
  and checks that a feature from the mock API is rendered, which also covers the worker
  setup above.

None of these exist yet. Like the API, once the suite exists it becomes a required check on
both rulesets.

## Enforcement

ESLint runs in CI as a blocking check, with `eslint-config-next` plus three rules that keep
the server from becoming a backend:

```js
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
}
```

**Stay on TypeScript 6 until `typescript-eslint` supports 7.** With TypeScript 7 installed,
`eslint-config-next` fails to load, so ESLint does not run at all. The CI step must fail
when ESLint errors out, not only when it reports violations.

## Open decisions

> TODO: authentication. The contract declares Bearer auth, but the token issuer is not
> decided. That also decides where the token lives and how Server Components forward it.

> TODO: the basemap tile provider. Tracked in `docs/architecture.md` in the system
> repository.

> TODO: hosting and environments. Tracked in `docs/architecture.md` in the system
> repository.
