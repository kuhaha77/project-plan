/**
 * 앞단 Worker 의 순수 로직 — 인증과 요청 변환. Cloudflare 전용 모듈에 의존하지 않아 단위 테스트가 쉽다.
 *
 * claude.ai 커스텀 커넥터는 임의 헤더를 실을 수 없다. 그래서 접근 토큰을 URL 경로(/mcp/<token>)로 받고,
 * 여기서 컨테이너가 요구하는 헤더로 바꿔 끼운다.
 *   - x-mcp-token : 컨테이너의 MCP_AUTH_TOKEN 과 같은 값(내부 인증)
 *   - apikey      : 법제처 OC. 사용자에게 OC 를 노출하지 않고 서버 secret 에서만 넣는다.
 */

export interface ProxyEnv {
  LAW_OC?: string;
  MCP_ACCESS_TOKEN?: string;
}

export const CONTAINER_ORIGIN = "http://container";

/** 컨테이너로 넘길 헤더(그 밖의 것은 버린다). */
const FORWARD_HEADERS = ["content-type", "accept", "mcp-protocol-version", "mcp-session-id", "last-event-id", "user-agent"];

function timingSafeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8" } });
}

export type Route = { kind: "health" } | { kind: "mcp" } | { kind: "not_found" };

export function route(url: URL): Route {
  if (url.pathname === "/" || url.pathname === "/health") return { kind: "health" };
  if (/^\/mcp(\/[^/]+)?\/?$/.test(url.pathname)) return { kind: "mcp" };
  return { kind: "not_found" };
}

export function authorize(req: Request, env: ProxyEnv): Response | null {
  const expected = env.MCP_ACCESS_TOKEN;
  if (!expected) return json(503, { error: "서버에 MCP_ACCESS_TOKEN 이 설정되지 않았습니다." });
  if (!env.LAW_OC) return json(503, { error: "서버에 LAW_OC(법제처 OC) 가 설정되지 않았습니다." });
  const url = new URL(req.url);
  const pathToken = url.pathname.match(/^\/mcp\/([^/]+)\/?$/)?.[1];
  const bearer = req.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  const given = pathToken ? decodeURIComponent(pathToken) : bearer;
  if (!given || !timingSafeEqual(given, expected)) {
    return json(401, { jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized." }, id: null });
  }
  return null;
}

/** 바깥 요청 → 컨테이너 요청. 쿼리의 oc 는 버린다(서버 OC 만 쓴다). profile 등 나머지 쿼리는 넘긴다. */
export async function toContainerRequest(req: Request, env: ProxyEnv): Promise<Request> {
  const src = new URL(req.url);
  const dst = new URL("/mcp", CONTAINER_ORIGIN);
  for (const [k, v] of src.searchParams) if (k.toLowerCase() !== "oc") dst.searchParams.append(k, v);

  const headers = new Headers();
  for (const name of FORWARD_HEADERS) {
    const v = req.headers.get(name);
    if (v !== null) headers.set(name, v);
  }
  headers.set("x-mcp-token", env.MCP_ACCESS_TOKEN!);
  headers.set("apikey", env.LAW_OC!);

  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  // MCP 요청 본문은 작다(JSON-RPC). 스트림 대신 버퍼로 넘겨 런타임 차이를 없앤다.
  return new Request(dst.toString(), { method: req.method, headers, body: hasBody ? await req.arrayBuffer() : undefined });
}

/** 컨테이너 기동 실패 등을 MCP 클라이언트가 읽을 수 있는 오류로 바꾼다. */
export function upstreamError(e: unknown): Response {
  const msg = e instanceof Error ? e.message : String(e);
  return json(502, {
    jsonrpc: "2.0",
    error: { code: -32603, message: `법령 서버(컨테이너)에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요. (${msg.slice(0, 200)})` },
    id: null,
  });
}

/** 공통 처리. container 는 컨테이너로 요청을 보내는 함수(테스트에서는 가짜). */
export async function handle(req: Request, env: ProxyEnv, container: (r: Request) => Promise<Response>): Promise<Response> {
  const url = new URL(req.url);
  const r = route(url);
  if (r.kind === "health") return json(200, { name: "korean-law-mcp", status: "ok", endpoint: "/mcp/<token>" });
  if (r.kind === "not_found") return json(404, { error: "not found" });
  const denied = authorize(req, env);
  if (denied) return denied;
  try {
    return await container(await toContainerRequest(req, env));
  } catch (e) {
    return upstreamError(e);
  }
}
