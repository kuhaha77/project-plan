import { describe, expect, it, vi, beforeEach } from "vitest";
import { cleanText, formatDate, summarizeTrend } from "../src/naver";
import { kstDate } from "../src/server";
import worker from "../src/index";

const NEWS = {
  lastBuildDate: "Mon, 13 Oct 2026 10:00:00 +0900",
  total: 1234,
  start: 1,
  display: 2,
  items: [
    {
      title: "<b>중대재해</b> 처벌법 &quot;첫 판결&quot;",
      originallink: "https://www.yna.co.kr/view/AKR1",
      link: "https://n.news.naver.com/mnews/article/001/1",
      description: "건설현장 &amp; <b>중대재해</b>…",
      pubDate: "Mon, 13 Oct 2026 00:30:00 +0000",
    },
    {
      title: "두번째",
      originallink: "",
      link: "https://n.news.naver.com/mnews/article/002/2",
      description: "설명",
      pubDate: "Sun, 12 Oct 2026 09:00:00 +0900",
    },
  ],
};

const DATALAB = {
  startDate: "2026-07-01",
  endDate: "2026-10-01",
  timeUnit: "month",
  results: [
    {
      title: "중대재해",
      keywords: ["중대재해", "중대재해처벌법"],
      data: [
        { period: "2026-07-01", ratio: 20 },
        { period: "2026-08-01", ratio: 30 },
        { period: "2026-09-01", ratio: 100 },
      ],
    },
    { title: "없음", keywords: ["아무도안찾는말"], data: [] },
  ],
};

function mockFetch(opts: { status?: number; body?: unknown } = {}) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (opts.status) return new Response(JSON.stringify(opts.body ?? {}), { status: opts.status });
    const url = String(input);
    const h = new Headers(init?.headers);
    if (h.get("X-Naver-Client-Id") !== "id" || h.get("X-Naver-Client-Secret") !== "secret") {
      return new Response(JSON.stringify({ errorMessage: "Authentication failed", errorCode: "024" }), { status: 401 });
    }
    if (url.includes("/search/news.json")) return new Response(JSON.stringify(NEWS));
    if (url.includes("/search/blog.json")) return new Response(JSON.stringify({ total: 0, start: 1, display: 0, items: [] }));
    if (url.endsWith("/datalab/search") && init?.method === "POST") {
      const body = JSON.parse(String(init.body));
      expect(body.keywordGroups[0]).toEqual({ groupName: "중대재해", keywords: ["중대재해", "중대재해처벌법"] });
      return new Response(JSON.stringify(DATALAB));
    }
    return new Response("{}", { status: 404 });
  });
}

describe("도우미", () => {
  it("강조 태그·엔티티 제거", () => {
    expect(cleanText(NEWS.items[0]!.title)).toBe('중대재해 처벌법 "첫 판결"');
  });
  it("날짜는 KST", () => {
    expect(formatDate(NEWS.items[0]!)).toBe("2026-10-13 09:30");
    expect(formatDate({ title: "", link: "", description: "", postdate: "20261001" })).toBe("2026-10-01");
  });
  it("트렌드 요약", () => {
    const s = summarizeTrend(DATALAB.results[0]!);
    expect(s.peak).toEqual({ period: "2026-09-01", ratio: 100 });
    expect(s.recentVsEarlier).toBeCloseTo(100 / 25);
  });
  it("KST 날짜 계산", () => {
    // 2026-10-12 16:00 UTC = 2026-10-13 01:00 KST
    expect(kstDate(0, Date.UTC(2026, 9, 12, 16))).toBe("2026-10-13");
    expect(kstDate(-90, Date.UTC(2026, 9, 12, 16))).toBe("2026-07-15");
  });
});

const ENV = { NAVER_CLIENT_ID: "id", NAVER_CLIENT_SECRET: "secret", MCP_ACCESS_TOKEN: "tok" };

async function rpc(path: string, method: string, params: unknown, env: Record<string, string> = ENV) {
  const res = await worker.fetch(
    new Request(`https://naver.example${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    }),
    env,
  );
  return { status: res.status, body: res.status === 200 ? ((await res.json()) as any) : await res.text() };
}

describe("worker", () => {
  beforeEach(() => vi.stubGlobal("fetch", mockFetch()));

  it("토큰 검사", async () => {
    expect((await rpc("/mcp/bad", "tools/list", {})).status).toBe(401);
    const r = await rpc("/mcp/tok", "tools/list", {});
    expect(r.body.result.tools.map((t: { name: string }) => t.name)).toEqual([
      "search_news",
      "search_blog",
      "search_cafearticle",
      "search_webkr",
      "datalab_search",
    ]);
  });

  it("search_news 는 기본 최신순, 원문 링크·매체를 보여 준다", async () => {
    const r = await rpc("/mcp/tok", "tools/call", { name: "search_news", arguments: { query: "중대재해" } });
    const t = r.body.result.content[0].text as string;
    expect(t).toContain("최신순");
    expect(t).toContain('1. **중대재해 처벌법 "첫 판결"** (2026-10-13 09:30 · yna.co.kr)');
    expect(t).toContain("https://www.yna.co.kr/view/AKR1");
    expect(t).toContain("https://n.news.naver.com/mnews/article/002/2");
    const url = String((globalThis.fetch as any).mock.calls[0][0]);
    expect(url).toContain("sort=date");
  });

  it("결과 없음", async () => {
    const r = await rpc("/mcp/tok", "tools/call", { name: "search_blog", arguments: { query: "없는말" } });
    expect(r.body.result.content[0].text).toContain("결과가 없습니다");
  });

  it("datalab_search 요약과 상대지수 경고", async () => {
    const r = await rpc("/mcp/tok", "tools/call", {
      name: "datalab_search",
      arguments: {
        keyword_groups: [
          { group_name: "중대재해", keywords: ["중대재해", "중대재해처벌법"] },
          { group_name: "없음", keywords: ["아무도안찾는말"] },
        ],
        start_date: "2026-07-01",
        end_date: "2026-10-01",
        time_unit: "month",
      },
    });
    const t = r.body.result.content[0].text as string;
    expect(t).toContain("최고 100.0 (2026-09-01)");
    expect(t).toContain("4.00배");
    expect(t).toContain("데이터 없음");
    expect(t).toContain("상대 지수");
  });

  it("인증 실패는 도구 오류로", async () => {
    const r = await rpc("/mcp/tok", "tools/call", { name: "search_news", arguments: { query: "x" } }, { ...ENV, NAVER_CLIENT_SECRET: "bad" });
    expect(r.body.result.isError).toBe(true);
    expect(r.body.result.content[0].text).toContain("인증 실패");
  });

  it("한도 초과", async () => {
    vi.stubGlobal("fetch", mockFetch({ status: 429, body: { errorMessage: "Rate limit exceeded", errorCode: "010" } }));
    const r = await rpc("/mcp/tok", "tools/call", { name: "search_news", arguments: { query: "x" } });
    expect(r.body.result.content[0].text).toContain("일일 호출 한도");
  });

  it("키가 없으면 안내", async () => {
    const r = await rpc("/mcp/tok", "tools/call", { name: "search_news", arguments: { query: "x" } }, { MCP_ACCESS_TOKEN: "tok" });
    expect(r.body.result.content[0].text).toContain("NAVER_CLIENT_ID");
  });
});
