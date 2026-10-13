import { describe, expect, it, vi } from "vitest";
import { CONTAINER_ORIGIN, handle, toContainerRequest } from "../src/proxy";

const ENV = { LAW_OC: "honggildong", MCP_ACCESS_TOKEN: "secret-token" };

function mcpReq(path: string, headers: Record<string, string> = {}) {
  return new Request(`https://law.example${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Origin: "https://evil.example",
      ...headers,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
}

describe("handle", () => {
  it("health 는 인증 없이 응답하고 컨테이너를 깨우지 않는다", async () => {
    const container = vi.fn();
    const res = await handle(new Request("https://law.example/health"), ENV, container);
    expect(res.status).toBe(200);
    expect(container).not.toHaveBeenCalled();
  });

  it("토큰이 없거나 틀리면 401, 컨테이너로 가지 않는다", async () => {
    const container = vi.fn();
    expect((await handle(mcpReq("/mcp"), ENV, container)).status).toBe(401);
    expect((await handle(mcpReq("/mcp/wrong"), ENV, container)).status).toBe(401);
    expect((await handle(mcpReq("/mcp", { Authorization: "Bearer wrong" }), ENV, container)).status).toBe(401);
    expect(container).not.toHaveBeenCalled();
  });

  it("비밀값이 빠진 배포는 503 으로 알린다", async () => {
    const container = vi.fn();
    expect((await handle(mcpReq("/mcp/secret-token"), { MCP_ACCESS_TOKEN: "secret-token" }, container)).status).toBe(503);
    expect((await handle(mcpReq("/mcp/x"), { LAW_OC: "a" }, container)).status).toBe(503);
  });

  it("경로 토큰·Bearer 모두 통과시키고 컨테이너 응답을 그대로 돌려준다", async () => {
    const container = vi.fn(async () => new Response('{"ok":1}', { status: 200 }));
    expect((await handle(mcpReq("/mcp/secret-token"), ENV, container)).status).toBe(200);
    expect((await handle(mcpReq("/mcp", { Authorization: "Bearer secret-token" }), ENV, container)).status).toBe(200);
    expect(container).toHaveBeenCalledTimes(2);
  });

  it("컨테이너 기동 실패는 JSON-RPC 오류(502)로", async () => {
    const res = await handle(mcpReq("/mcp/secret-token"), ENV, async () => {
      throw new Error("container did not start");
    });
    expect(res.status).toBe(502);
    expect(((await res.json()) as any).error.message).toContain("컨테이너");
  });
});

describe("toContainerRequest", () => {
  it("내부 토큰·OC 헤더를 넣고, 바깥의 oc·Authorization·Origin 은 버린다", async () => {
    const out = await toContainerRequest(
      mcpReq("/mcp/secret-token?profile=lite&oc=someone-else", { Authorization: "Bearer secret-token", "mcp-protocol-version": "2025-06-18" }),
      ENV,
    );
    const u = new URL(out.url);
    expect(u.origin).toBe(CONTAINER_ORIGIN);
    expect(u.pathname).toBe("/mcp");
    expect(u.searchParams.get("profile")).toBe("lite");
    expect(u.searchParams.has("oc")).toBe(false);
    expect(out.headers.get("x-mcp-token")).toBe("secret-token");
    expect(out.headers.get("apikey")).toBe("honggildong");
    expect(out.headers.get("authorization")).toBeNull();
    expect(out.headers.get("origin")).toBeNull();
    expect(out.headers.get("mcp-protocol-version")).toBe("2025-06-18");
    expect(JSON.parse(await out.text()).method).toBe("tools/list");
  });
});

// ── 실제 korean-law-mcp 서버와의 왕복 (LAW_UPSTREAM_URL 을 주었을 때만) ──────────────
// 예: korean-law-mcp 를 MCP_AUTH_TOKEN=secret-token 으로 띄우고 LAW_UPSTREAM_URL=http://127.0.0.1:3000 npm test
const upstream = process.env.LAW_UPSTREAM_URL;
describe.skipIf(!upstream)("실서버 왕복", () => {
  const forward = (r: Request) => {
    const u = new URL(r.url);
    return fetch(`${upstream}${u.pathname}${u.search}`, { method: r.method, headers: r.headers, body: r.body, duplex: "half" } as RequestInit);
  };

  it("tools/list 가 PlayMCP 와 같은 10개 도구를 준다", async () => {
    const res = await handle(mcpReq("/mcp/secret-token"), ENV, forward);
    expect(res.status).toBe(200);
    const text = await res.text();
    for (const name of [
      "search_law",
      "get_law_text",
      "get_annexes",
      "search_decisions",
      "get_decision_text",
      "legal_research",
      "legal_analysis",
      "ordinance_radar",
      "discover_tools",
      "execute_tool",
    ]) {
      expect(text).toContain(`"name":"${name}"`);
    }
  });
});
