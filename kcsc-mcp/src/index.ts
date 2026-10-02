/**
 * Cloudflare Worker 진입점 — Streamable HTTP(무상태) MCP 엔드포인트.
 *
 *   POST /mcp/<MCP_ACCESS_TOKEN>        ← claude.ai 커스텀 커넥터에 이 URL 을 등록
 *   POST /mcp  + Authorization: Bearer <MCP_ACCESS_TOKEN>   ← Claude Code 등 헤더를 넣을 수 있는 클라이언트
 *
 * KCSC 인증키(KCSC_API_KEY)는 Worker secret 에만 있고 클라이언트에는 나가지 않는다.
 * MCP_ACCESS_TOKEN 이 없으면 요청을 받지 않는다(키 무단 사용 방지).
 */
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { KcscClient, makeStore } from "./kcsc";
import { createServer } from "./server";

export interface Env {
  KCSC_API_KEY?: string;
  MCP_ACCESS_TOKEN?: string;
  KCSC_CACHE?: KVNamespace;
}

function timingSafeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8" } });
}

export function authorize(req: Request, env: Env): { ok: true } | { ok: false; res: Response } {
  const expected = env.MCP_ACCESS_TOKEN;
  if (!expected) {
    return { ok: false, res: json(503, { error: "서버에 MCP_ACCESS_TOKEN 이 설정되지 않았습니다." }) };
  }
  const url = new URL(req.url);
  const pathToken = url.pathname.match(/^\/mcp\/([^/]+)\/?$/)?.[1];
  const bearer = req.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  const given = pathToken ? decodeURIComponent(pathToken) : bearer;
  if (!given || !timingSafeEqual(given, expected)) return { ok: false, res: json(401, { error: "unauthorized" }) };
  return { ok: true };
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/" || url.pathname === "/health") {
      return json(200, { name: "kcsc-mcp", status: "ok", endpoint: "/mcp/<token>" });
    }
    if (!/^\/mcp(\/[^/]+)?\/?$/.test(url.pathname)) return json(404, { error: "not found" });

    const auth = authorize(req, env);
    if (!auth.ok) return auth.res;

    // 무상태 모드: 요청마다 서버·트랜스포트를 새로 만든다. 세션 상태가 필요 없는 조회 전용 도구라 충분하다.
    const client = new KcscClient(env.KCSC_API_KEY, makeStore(env.KCSC_CACHE));
    const server = createServer(client);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    await server.connect(transport);
    return transport.handleRequest(req);
  },
} satisfies ExportedHandler<Env>;
