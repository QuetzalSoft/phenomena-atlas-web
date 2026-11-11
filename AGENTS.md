# Phenomena Atlas web interface

The web client for Phenomena Atlas. It is a client: it holds presentation logic and
client state, and reaches all domain data through the API.

## Read the system context first

This repository is one component of a larger product. The context that explains how it
fits together lives in the system repository, `QuetzalSoft/phenomena-atlas`:

- `contracts/main.tsp` - the contract this client consumes (compiled to
  `contracts/generated/openapi.yaml`, which is the document to read)
- `docs/domain.md` - the shared vocabulary
- `docs/release.md` - how a change crossing components is shipped
- `docs/architecture.md` - why things are split this way

If this repository is cloned on its own, that context is missing. Clone the workspace
instead and this becomes automatic:

```sh
git clone git@github.com:QuetzalSoft/phenomena-atlas.git
cd phenomena-atlas && ./scripts/bootstrap.sh
```

That places this repository at `phenomena-atlas/web/`, where the system `AGENTS.md` is
inherited from the parent directory.

## Talking to the API

Types come from the pinned package `@quetzalsoft/phenomena-atlas-contract` and requests
go through `openapi-fetch`, which is typed by them.

Hand-written fetch calls against API endpoints are not allowed, even for a quick fix.
They are invisible to the contract, so they survive a breaking change in CI and fail in
front of a user instead.

Needing something the API does not expose is a contract change, not a workaround. See
`docs/release.md` in the system repository.

## Stack

TypeScript on Next.js with the App Router, running on the active Node.js LTS, with Bun as
the package manager. The map is MapLibre GL JS through `react-map-gl/maplibre`.

`docs/architecture.md` describes how the code is structured, what runs on the server and
what in the browser, and the map setup that breaks silently if done wrong. Read it before
adding a page or a feature. The Next.js server is not a backend: it reaches data only
through the API. Why this stack was chosen is in ADR 0007 in the system repository.

## Commands

The contract package comes from GitHub Packages, so installing needs `GITHUB_TOKEN` set to
a token with `read:packages` (`export GITHUB_TOKEN=$(gh auth token)` after
`gh auth refresh -s read:packages`). Copy `.env.example` to `.env.local` and set `AUTH_SECRET` (`openssl rand -base64 32`).

Signing in needs Keycloak, which the API repository runs: `docker compose up -d --wait` in
`../api`. Its realm has a `dev` user (password `dev`) and an `admin` user (password `admin`);
`bun run set-role 00000000-0000-4000-8000-000000000001 admin` in `../api` makes the latter
an admin, who can open `/admin/accounts`. How the web keeps and forwards tokens is in
`docs/architecture.md`, "Authentication".

```sh
bun install
bun run dev          # :3000, expects the API at the URLs in .env.local
bun run build && bun run start
bun run typecheck
bun run lint
bun run test         # unit tests (Vitest), *.test.ts next to the code
bunx playwright install chromium   # once
bun run test:e2e     # production build against the mock API in tests/e2e/mock-api.ts and a
                     # Keycloak in Docker on :8190. Needs Docker, and Node on the PATH:
                     # without it Bun stands in for `node` and `next build` fails
```

`/dashboard` checks the API from the server and from the browser. With the API from
`../api` running, it is the quickest way to see the whole chain work.

## Conventions

- All project text is English: code, comments, commits, documentation. This includes
  user-facing copy; localisation is a separate concern, not a reason to mix languages
  in the source.
- `main` is production, `develop` integrates the sprint (ADR 0005 in the system
  repository). Branch off `develop` and open pull requests into it. `main` only takes
  releases from `develop` and fixes from `hotfix/*`.
- Client-side validation is for user experience. The API is what enforces the rules.

## `main` and `develop` are protected

This repository is public. Both branches require a pull request and one approving
review, and cannot be deleted or force-pushed. `main` also only accepts merge commits
and requires the `source-branch` check, which rejects pull requests that do not come
from `develop` or `hotfix/*`. Organisation admins can bypass all of it, including
pushing straight to `main`; that is an escape hatch, not a route.

Both branches also require the `test` check (`.github/workflows/test.yml`): typecheck,
lint, and the end-to-end suite, which builds the site for production. It runs on every
pull request with no paths filter, because a required check that never reports blocks the
merge. Installing needs the contract package, which is private: this repository needs read
access to it under the package's "Manage Actions access" settings, and losing that access
shows up as a 403 in the install step. When the suite fails, its traces are uploaded as
the `playwright-traces` artifact of the run.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
