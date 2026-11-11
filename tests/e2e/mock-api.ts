// A stand-in for the API, typed by the contract so it cannot drift from it.
// Tests switch its behavior through POST /__mock/health-mode.
import { createServer, type ServerResponse } from "node:http";
import type { components, paths } from "@quetzalsoft/phenomena-atlas-contract";

export type HealthMode = "ok" | "failed" | "unreachable";

type HealthBody = paths["/health"]["get"]["responses"][200]["content"]["application/json"];
type ErrorBody = components["schemas"]["Error"];

const port = Number(process.env.MOCK_API_PORT ?? 8100);
const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:3100";
let mode: HealthMode = "ok";

function json(response: ServerResponse, status: number, body: HealthBody | ErrorBody | { mode: HealthMode }) {
  response.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": webOrigin,
  });
  response.end(JSON.stringify(body));
}

createServer((request, response) => {
  if (request.method === "POST" && request.url === "/__mock/health-mode") {
    let raw = "";
    request.on("data", (chunk: Buffer) => (raw += chunk.toString()));
    request.on("end", () => {
      mode = (JSON.parse(raw) as { mode: HealthMode }).mode;
      json(response, 200, { mode });
    });
    return;
  }

  if (request.method === "GET" && request.url === "/health") {
    if (mode === "unreachable") {
      request.socket.destroy();
      return;
    }
    if (mode === "failed") {
      json(response, 503, { code: "service_unavailable", message: "Mocked failure." });
      return;
    }
    json(response, 200, { status: "ok" });
    return;
  }

  json(response, 404, { code: "not_found", message: "Not declared by the mock." });
}).listen(port, () => console.log(`Mock API on http://localhost:${port}`));
