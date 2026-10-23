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

React with TypeScript.

> TODO: framework, build tool, package manager, and the test, lint, run and build
> commands. Fill this in with the first real commit. Keep it to the commands a new
> contributor would otherwise have to find by reading config files.

## Conventions

- All project text is English: code, comments, commits, documentation. This includes
  user-facing copy; localisation is a separate concern, not a reason to mix languages
  in the source.
- Short-lived branches off `main`, pull requests, no long-running branches.

## `main` is protected

This repository is public. `main` requires a pull request and one approving review, and
cannot be deleted or force-pushed. Organisation admins can bypass all of it, including
pushing straight to `main`; that is an escape hatch, not a route.

> TODO: there is no required status check here yet, because there is no CI yet. Once
> this component has a test suite, add it to the ruleset as a required check. Until then
> a pull request can be merged with failing tests, because nothing is watching.
- Client-side validation is for user experience. The API is what enforces the rules.
