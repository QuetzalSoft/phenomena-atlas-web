// A stand-in for the API, typed by the contract so it cannot drift from it.
// Tests change its behavior through the POST /__mock/* routes.
//
// It trusts the Bearer token's claims without checking the signature: the tokens come from
// the test Keycloak, and verifying them is the API's job, covered by the API's own tests.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import type { components, paths } from "@quetzalsoft/phenomena-atlas-contract";

export type HealthMode = "ok" | "failed" | "unreachable";

type HealthBody = paths["/health"]["get"]["responses"][200]["content"]["application/json"];
type Account = components["schemas"]["Account"];
type AccountPage = components["schemas"]["AccountPage"];
type Role = components["schemas"]["Role"];
type ErrorBody = components["schemas"]["Error"];
type ChangeRoleBody = paths["/accounts/{accountId}/role"]["put"]["requestBody"]["content"]["application/json"];
type MunicipalityCollection = components["schemas"]["MunicipalityCollection"];
type Region = components["schemas"]["Region"];
type RegionPartition = components["schemas"]["RegionPartition"];
type PartitionVersion = components["schemas"]["PartitionVersion"];
type PartitionVersionPage = components["schemas"]["PartitionVersionPage"];
type PartitionChange = components["schemas"]["PartitionChange"];
type MultiPolygon = components["schemas"]["GeoJson.MultiPolygon"];

/** Makes the next role change fail with this answer, whatever it asks for. */
export interface RoleChangeFailure {
  status: 401 | 403 | 404;
  code: string;
}

/** Makes the next partition save fail with this answer, whatever it sends. */
export interface SaveFailure {
  status: 400 | 401 | 403 | 409;
  code: string;
  details?: Record<string, unknown>;
}

/** Accounts created by the test before anyone signs in, such as people who signed in long ago. */
export interface SeedAccount {
  username: string;
  role: Role;
  name?: string;
  /** Defaults to one minute after the previous seed account, starting on 2026-01-01. */
  createdAt?: string;
}

const port = Number(process.env.MOCK_API_PORT ?? 8100);
const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:3100";
/** Usernames that get the admin role on their first call, as the seeded first admin does. */
const admins = new Set(["admin"]);

let mode: HealthMode = "ok";
let roleChangeFailure: RoleChangeFailure | undefined;
/** Oldest first, keyed by the token subject. */
let accounts: { subject: string; account: Account }[] = [];

// Regions: two municipalities drawn as boxes west and east of 103.4° W. Guadalajara starts
// split in two halves, Zapopan is one region. The mock trusts saved geometry: checking the
// partition is the API's job, covered by the API's own tests.

/** A rectangle as a MultiPolygon, counter-clockwise. */
export function box(west: number, south: number, east: number, north: number): MultiPolygon {
  return {
    type: "MultiPolygon",
    coordinates: [[[[west, south], [east, south], [east, north], [west, north], [west, south]]]],
  };
}

const municipalities: MunicipalityCollection = {
  type: "FeatureCollection",
  features: [
    { type: "Feature", id: "14039", properties: { name: "Guadalajara" }, geometry: box(-103.4, 20.6, -103.3, 20.7) },
    { type: "Feature", id: "14120", properties: { name: "Zapopan" }, geometry: box(-103.5, 20.6, -103.4, 20.7) },
  ],
};

function initialRegions(): Region[] {
  const region = (id: number, name: string, population: number, municipalityCode: string, geometry: MultiPolygon): Region => ({
    type: "Feature",
    id,
    properties: { name, population, municipalityCode },
    geometry,
  });
  return [
    region(1, "Centro", 1000, "14039", box(-103.4, 20.6, -103.35, 20.7)),
    region(2, "Oblatos", 600, "14039", box(-103.35, 20.6, -103.3, 20.7)),
    region(3, "Zapopan centro", 2000, "14120", box(-103.5, 20.6, -103.4, 20.7)),
  ];
}

/** Every saved version, oldest first, with the partition as it stood. */
let versions: { summary: PartitionVersion; regions: Region[] }[] = [];
let nextRegionId = 4;
let saveFailure: SaveFailure | undefined;

function resetRegions() {
  versions = [
    {
      summary: { number: 1, createdAt: "2026-01-01T00:00:00Z", added: [1, 2, 3], changed: [], retired: [] },
      regions: initialRegions(),
    },
  ];
  nextRegionId = 4;
  saveFailure = undefined;
}
resetRegions();

function partitionAt(entry: { summary: PartitionVersion; regions: Region[] }): RegionPartition {
  return { type: "FeatureCollection", version: entry.summary.number, createdAt: entry.summary.createdAt, features: entry.regions };
}

/** Applies a change as the API would once it passes its checks. */
function savePartition(change: PartitionChange, author: Account): PartitionVersion {
  const latest = versions.at(-1)!;
  const regions = new Map(latest.regions.map((region) => [region.id, region]));
  const summary: PartitionVersion = {
    number: latest.summary.number + 1,
    createdAt: new Date().toISOString(),
    author: { id: author.id, ...(author.username && { username: author.username }), ...(author.name && { name: author.name }) },
    added: [],
    changed: [],
    retired: [...change.retiredRegionIds],
  };
  for (const id of change.retiredRegionIds) {
    regions.delete(id);
  }
  for (const draft of change.regions) {
    const id = draft.id ?? nextRegionId++;
    (draft.id === undefined ? summary.added : summary.changed).push(id);
    regions.set(id, {
      type: "Feature",
      id,
      properties: { name: draft.name, population: draft.population, municipalityCode: draft.municipalityCode },
      geometry: draft.geometry,
    });
  }
  versions.push({ summary, regions: [...regions.values()] });
  return summary;
}

function send(response: ServerResponse, status: number, body?: unknown, headers: Record<string, string> = {}) {
  response.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": webOrigin,
    ...headers,
  });
  response.end(body === undefined ? undefined : JSON.stringify(body));
}

function fail(response: ServerResponse, status: number, code: string, message: string) {
  const body: ErrorBody = { code, message };
  send(response, status, body, status === 401 ? { "www-authenticate": "Bearer" } : {});
}

async function readJson<T>(request: IncomingMessage): Promise<T> {
  let raw = "";
  for await (const chunk of request) {
    raw += (chunk as Buffer).toString();
  }
  return JSON.parse(raw || "{}") as T;
}

interface Claims {
  sub: string;
  preferred_username?: string;
  name?: string;
  email?: string;
}

function claimsOf(request: IncomingMessage): Claims | undefined {
  const token = request.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
  const payload = token?.split(".")[1];
  if (!payload) {
    return undefined;
  }
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString()) as Partial<Claims>;
    return typeof claims.sub === "string" ? (claims as Claims) : undefined;
  } catch {
    return undefined;
  }
}

/** The caller's account, created on first sight and refreshed from the token, as the API does. */
function accountOf(claims: Claims): Account {
  let entry = accounts.find((candidate) => candidate.subject === claims.sub);
  if (!entry) {
    const role: Role = claims.preferred_username && admins.has(claims.preferred_username) ? "admin" : "user";
    entry = { subject: claims.sub, account: { id: randomUUID(), role, createdAt: new Date().toISOString() } };
    accounts.push(entry);
  }
  entry.account = {
    ...entry.account,
    username: claims.preferred_username,
    name: claims.name,
    email: claims.email,
  };
  return entry.account;
}

async function handle(request: IncomingMessage, response: ServerResponse) {
  const url = new URL(request.url ?? "/", `http://localhost:${port}`);
  const route = `${request.method} ${url.pathname}`;

  // Test controls.
  if (route === "POST /__mock/health-mode") {
    mode = (await readJson<{ mode: HealthMode }>(request)).mode;
    return send(response, 200, { mode });
  }
  if (route === "POST /__mock/reset") {
    const { seed = [] } = await readJson<{ seed?: SeedAccount[] }>(request);
    mode = "ok";
    roleChangeFailure = undefined;
    resetRegions();
    const createdAt = Date.parse("2026-01-01T00:00:00Z");
    accounts = seed.map(({ username, role, name, createdAt: at }, index) => ({
      subject: randomUUID(),
      account: {
        id: randomUUID(),
        username,
        ...(name && { name }),
        email: `${username}@example.test`,
        role,
        createdAt: at ?? new Date(createdAt + index * 60_000).toISOString(),
      },
    }));
    return send(response, 200, {});
  }
  if (route === "POST /__mock/role-change-failure") {
    roleChangeFailure = await readJson<RoleChangeFailure>(request);
    return send(response, 200, {});
  }

  if (route === "POST /__mock/save-failure") {
    saveFailure = await readJson<SaveFailure>(request);
    return send(response, 200, {});
  }
  if (route === "POST /__mock/save-as-someone-else") {
    // Another admin saves first: the next save from the page is based on an old version.
    const latest = versions.at(-1)!;
    const someone: Account = { id: randomUUID(), username: "other-admin", role: "admin", createdAt: "2026-01-01T00:00:00Z" };
    const first = latest.regions[0]!;
    return send(
      response,
      200,
      savePartition({ baseVersion: latest.summary.number, regions: [{ id: first.id, ...first.properties, geometry: first.geometry }], retiredRegionIds: [] }, someone),
    );
  }

  // CORS preflight for the browser's authenticated calls.
  if (request.method === "OPTIONS") {
    return send(response, 204, undefined, {
      "access-control-allow-methods": "GET, PUT, POST",
      "access-control-allow-headers": "authorization, content-type",
    });
  }

  if (route === "GET /health") {
    if (mode === "unreachable") {
      request.socket.destroy();
      return;
    }
    if (mode === "failed") {
      return fail(response, 503, "service_unavailable", "Mocked failure.");
    }
    const body: HealthBody = { status: "ok" };
    return send(response, 200, body);
  }

  // Public reads.
  if (route === "GET /municipalities") {
    return send(response, 200, municipalities);
  }
  if (route === "GET /region-partition") {
    return send(response, 200, partitionAt(versions.at(-1)!));
  }

  if (!url.pathname.startsWith("/accounts") && !url.pathname.startsWith("/region-partition/")) {
    return fail(response, 404, "not_found", "Not declared by the mock.");
  }

  const claims = claimsOf(request);
  if (!claims) {
    return fail(response, 401, "unauthorized", "No valid token.");
  }
  const me = accountOf(claims);

  if (route === "GET /accounts/me") {
    return send(response, 200, me);
  }

  if (me.role !== "admin") {
    return fail(response, 403, "forbidden", "Admins only.");
  }

  if (route === "GET /accounts") {
    const query = url.searchParams;
    const limit = Number(query.get("limit") ?? 50);
    const start = Number(query.get("cursor") ?? 0);
    if (!Number.isInteger(limit) || limit < 1 || limit > 200 || !Number.isInteger(start) || start < 0) {
      return fail(response, 400, "invalid_request", "limit or cursor is not valid.");
    }
    // The same filters as the API: optional, combined with AND.
    const role = query.get("role");
    const text = query.get("q")?.toLowerCase();
    const from = query.has("createdFrom") ? Date.parse(query.get("createdFrom")!) : undefined;
    const before = query.has("createdBefore") ? Date.parse(query.get("createdBefore")!) : undefined;
    if (from !== undefined && before !== undefined && from >= before) {
      return fail(response, 400, "invalid_date_range", "createdFrom must be earlier than createdBefore.");
    }
    const matching = accounts
      .map((entry) => entry.account)
      .filter(
        (account) =>
          (!role || account.role === role) &&
          (!text || [account.username, account.name, account.email].some((field) => field?.toLowerCase().includes(text))) &&
          (from === undefined || Date.parse(account.createdAt) >= from) &&
          (before === undefined || Date.parse(account.createdAt) < before),
      );
    const end = start + limit;
    const body: AccountPage = {
      items: matching.slice(start, end),
      ...(end < matching.length && { nextCursor: String(end) }),
    };
    return send(response, 200, body);
  }

  if (route === "GET /region-partition/versions") {
    const limit = Number(url.searchParams.get("limit") ?? 50);
    const start = Number(url.searchParams.get("cursor") ?? 0);
    const newestFirst = versions.map((entry) => entry.summary).reverse();
    const end = start + limit;
    const body: PartitionVersionPage = {
      items: newestFirst.slice(start, end),
      ...(end < newestFirst.length && { nextCursor: String(end) }),
    };
    return send(response, 200, body);
  }
  const versionRoute = url.pathname.match(/^\/region-partition\/versions\/(\d+)$/);
  if (request.method === "GET" && versionRoute) {
    const entry = versions.find((candidate) => candidate.summary.number === Number(versionRoute[1]));
    return entry ? send(response, 200, partitionAt(entry)) : fail(response, 404, "partition_version_not_found", "No such version.");
  }
  if (route === "POST /region-partition/versions") {
    const change = await readJson<PartitionChange>(request);
    if (saveFailure) {
      const { status, code, details } = saveFailure;
      saveFailure = undefined;
      const body: ErrorBody = { code, message: "Mocked failure.", ...(details && { details }) };
      return send(response, status, body);
    }
    if (change.baseVersion !== versions.at(-1)!.summary.number) {
      return fail(response, 409, "partition_version_conflict", "The partition changed since baseVersion.");
    }
    if (change.regions.length === 0 && change.retiredRegionIds.length === 0) {
      return fail(response, 400, "empty_change", "The change changes nothing.");
    }
    return send(response, 201, savePartition(change, me));
  }

  const roleRoute = url.pathname.match(/^\/accounts\/([^/]+)\/role$/);
  if (request.method === "PUT" && roleRoute) {
    const { role } = await readJson<ChangeRoleBody>(request);
    if (roleChangeFailure) {
      const { status, code } = roleChangeFailure;
      roleChangeFailure = undefined;
      return fail(response, status, code, "Mocked failure.");
    }
    const entry = accounts.find((candidate) => candidate.account.id === roleRoute[1]);
    if (!entry) {
      return fail(response, 404, "account_not_found", "No account has that id.");
    }
    if (entry.account.id === me.id) {
      return fail(response, 403, "own_role_change_forbidden", "Admins cannot change their own role.");
    }
    entry.account = { ...entry.account, role };
    return send(response, 200, entry.account);
  }

  return fail(response, 404, "not_found", "Not declared by the mock.");
}

createServer((request, response) => {
  handle(request, response).catch((error: unknown) => {
    console.error(error);
    fail(response, 500, "internal_error", "The mock failed.");
  });
}).listen(port, () => console.log(`Mock API on http://localhost:${port}`));
