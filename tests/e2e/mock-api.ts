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

/** Makes the next role change fail with this answer, whatever it asks for. */
export interface RoleChangeFailure {
  status: 401 | 403 | 404;
  code: string;
}

/** Accounts created by the test before anyone signs in, such as people who signed in long ago. */
export interface SeedAccount {
  username: string;
  role: Role;
}

const port = Number(process.env.MOCK_API_PORT ?? 8100);
const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:3100";
/** Usernames that get the admin role on their first call, as the seeded first admin does. */
const admins = new Set(["admin"]);

let mode: HealthMode = "ok";
let roleChangeFailure: RoleChangeFailure | undefined;
/** Oldest first, keyed by the token subject. */
let accounts: { subject: string; account: Account }[] = [];

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
    const createdAt = Date.parse("2026-01-01T00:00:00Z");
    accounts = seed.map(({ username, role }, index) => ({
      subject: randomUUID(),
      account: {
        id: randomUUID(),
        username,
        email: `${username}@example.test`,
        role,
        createdAt: new Date(createdAt + index * 60_000).toISOString(),
      },
    }));
    return send(response, 200, {});
  }
  if (route === "POST /__mock/role-change-failure") {
    roleChangeFailure = await readJson<RoleChangeFailure>(request);
    return send(response, 200, {});
  }

  // CORS preflight for the browser's authenticated calls.
  if (request.method === "OPTIONS") {
    return send(response, 204, undefined, {
      "access-control-allow-methods": "GET, PUT",
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

  if (!url.pathname.startsWith("/accounts")) {
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
    const limit = Number(url.searchParams.get("limit") ?? 50);
    const start = Number(url.searchParams.get("cursor") ?? 0);
    if (!Number.isInteger(limit) || limit < 1 || limit > 200 || !Number.isInteger(start) || start < 0) {
      return fail(response, 400, "invalid_request", "limit or cursor is not valid.");
    }
    const end = start + limit;
    const body: AccountPage = {
      items: accounts.slice(start, end).map((entry) => entry.account),
      ...(end < accounts.length && { nextCursor: String(end) }),
    };
    return send(response, 200, body);
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
