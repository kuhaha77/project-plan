import { describe, expect, it, vi, beforeEach } from "vitest";
import { KcscClient, KcscError, makeStore, resetMemoryCache, normalizeCode, rejectNullSentinel, type CatalogEntry } from "../src/kcsc";
import { htmlToMarkdown, renderItems, sectionItems, outline, type ImageRef } from "../src/render";
import { searchCatalog } from "../src/server";
import worker from "../src/index";

const GIF = "R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

function entry(no: number, codeType: string, code: string, name: string, parents: string[] = []): CatalogEntry {
  return {
    no,
    codeType,
    code,
    fullCode: null,
    name,
    version: "2024",
    updateDate: "2024-05-01T00:00:00",
    listParentCodes: parents.map((n) => ({ name: n })),
  };
}

// 실측 구조를 따른 카탈로그: 100건 초과여야 온전한 카탈로그로 인정한다.
const CATALOG: CatalogEntry[] = [
  entry(1, "KDS", "142010", "콘크리트구조 철근상세 설계기준", ["설계기준", "콘크리트구조"]),
  entry(2, "KCS", "142010", "철근공사", ["표준시방서", "콘크리트공사"]),
  entry(3, "SMCS", "142010", "철근공사(서울시)", ["서울시 전문시방서"]),
  entry(4, "KCS", "142012", "거푸집 및 동바리", ["표준시방서", "콘크리트공사"]),
  entry(5, "KDS", "140000", "구조설계기준", ["설계기준"]),
  ...Array.from({ length: 120 }, (_, i) => entry(100 + i, "LHCS", String(500000 + i), `기타 ${i}`)),
];

const DOC = {
  no: 4,
  codeType: "KCS",
  code: "142012",
  name: "거푸집 및 동바리",
  version: "2024",
  updateDate: "2024-05-01T00:00:00",
  list: [
    { sort: 1, label: "1.", title: "1. 일반사항", contents: "" },
    { sort: 2, label: "본문", title: "1. 일반사항", contents: "<p>이 기준은 거푸집에 적용한다.</p>" },
    { sort: 3, label: "3.", title: "3. 시공", contents: "" },
    { sort: 4, label: "3.3", title: "3.3 거푸집 해체", contents: "" },
    {
      sort: 5,
      label: "(1)",
      title: "3.3 거푸집 해체",
      contents: `<p>존치기간은 압축강도 <img src="data:image/gif;base64,${GIF}"> 이상일 때 해체한다. 단위 mm<sup>2</sup></p>`,
    },
    {
      sort: 6,
      label: "표 3.3-1",
      title: "3.3 거푸집 해체",
      contents:
        "<table><caption>표 3.3-1 존치기간</caption><tr><th>부재</th><th>압축강도</th></tr>" +
        `<tr><td>슬래브 밑면</td><td>5 MPa <img src="data:image/gif;base64,${GIF}"></td></tr></table>`,
    },
    { sort: 7, label: "3.4", title: "3.4 동바리", contents: "" },
    { sort: 8, label: "본문", title: "3.4 동바리", contents: "<p>동바리는 수직으로 세운다.</p>" },
  ],
};

function mockFetch(opts: { badKey?: boolean } = {}) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (opts.badKey) {
      return new Response(JSON.stringify([{ no: 0, codeType: null, code: null, name: null, list: null }]));
    }
    if (url.includes("/CodeList")) return new Response(JSON.stringify(CATALOG));
    if (url.includes("/CodeViewer/KCS/142012")) return new Response(JSON.stringify([DOC]));
    if (url.includes("/CodeViewer/KDS/140000")) return new Response(JSON.stringify([{ ...CATALOG[4], list: null }]));
    return new Response("not found", { status: 404 });
  });
}

describe("normalizeCode", () => {
  it("여러 표기를 6자리로 맞춘다", () => {
    expect(normalizeCode("KDS 14 20 10")).toEqual({ type: "KDS", digits: "142010" });
    expect(normalizeCode("kcs 14 20 12 : 2022")).toEqual({ type: "KCS", digits: "142012" });
    expect(normalizeCode("142010")).toEqual({ type: null, digits: "142010" });
    expect(normalizeCode("SMCS 10101000")).toEqual({ type: "SMCS", digits: "10101000" });
  });
  it("자릿수가 틀리면 오류", () => {
    expect(() => normalizeCode("14 20")).toThrow(KcscError);
  });
});

describe("rejectNullSentinel", () => {
  it("틀린 키의 null 껍데기를 오류로 바꾼다", () => {
    expect(() => rejectNullSentinel([{ no: 0, codeType: null }])).toThrow(/인증키/);
    expect(() => rejectNullSentinel(CATALOG)).not.toThrow();
  });
});

describe("render", () => {
  it("표와 그림 번호를 보존하고 첨자를 접는다", () => {
    const images: ImageRef[] = [];
    const { text, hasFormula } = renderItems(sectionItems(DOC as never, "3.3"), images);
    expect(hasFormula).toBe(true);
    expect(text).toContain("### 3.3 거푸집 해체");
    expect(text).toContain("〔그림 1〕");
    expect(text).toContain("mm²");
    expect(text).toContain("**표 3.3-1 존치기간**");
    expect(text).toContain("| 슬래브 밑면 | 5 MPa 〔그림 2〕 |");
    expect(images).toHaveLength(2);
    expect(text).not.toContain("동바리는");
  });
  it("숫자가 있는 본문을 표로 오인하지 않는다", () => {
    expect(htmlToMarkdown("<p>0 1 2 값</p><table><tr><td>a</td></tr></table>")).toBe("0 1 2 값\n\n| a |\n| --- |");
  });
  it("목차", () => {
    expect(outline(DOC as never).map((o) => o.no)).toEqual(["1", "3", "3.3", "3.4"]);
  });
});

describe("searchCatalog", () => {
  it("이름·종류·코드로 찾는다", () => {
    expect(searchCatalog(CATALOG, "거푸집").hits[0]!.code).toBe("142012");
    expect(searchCatalog(CATALOG, "KCS 철근").hits.map((h) => h.codeType)).toEqual(["KCS"]);
    expect(searchCatalog(CATALOG, "14 20").hits[0]!.codeType).toBe("KDS");
    expect(searchCatalog(CATALOG, "콘크리트공사").hits.length).toBe(2);
  });
});

describe("KcscClient", () => {
  it("코드 충돌 시 KDS 를 고르고 다른 후보를 알린다", async () => {
    const c = new KcscClient("k", makeStore(), mockFetch() as unknown as typeof fetch);
    const { entry, notice } = await c.resolve("142010");
    expect(entry.codeType).toBe("KDS");
    expect(notice).toContain("KCS 14 20 10");
    expect(notice).toContain("SMCS 14 20 10");
  });
  it("상위 분류 노드는 본문이 없다고 말한다", async () => {
    const c = new KcscClient("k", makeStore(), mockFetch() as unknown as typeof fetch);
    await expect(c.document("KDS 14 00 00")).rejects.toThrow(/본문이 없습니다/);
  });
  it("키가 없으면 안내한다", async () => {
    const c = new KcscClient(undefined, makeStore(), mockFetch() as unknown as typeof fetch);
    await expect(c.catalog(true)).rejects.toThrow(/KCSC_API_KEY/);
  });
});

// ── Worker 를 통한 MCP 왕복 ─────────────────────────────────────────────────
const ENV = { KCSC_API_KEY: "test-key", MCP_ACCESS_TOKEN: "secret-token" };

async function rpc(path: string, method: string, params: unknown, headers: Record<string, string> = {}) {
  const res = await worker.fetch(
    new Request(`https://kcsc.example${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...headers },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    }),
    ENV,
  );
  return { status: res.status, body: res.status === 200 ? ((await res.json()) as any) : await res.text() };
}

describe("worker", () => {
  beforeEach(() => {
    resetMemoryCache();
    vi.stubGlobal("fetch", mockFetch());
  });

  it("토큰이 없으면 401", async () => {
    expect((await rpc("/mcp", "tools/list", {})).status).toBe(401);
    expect((await rpc("/mcp/wrong", "tools/list", {})).status).toBe(401);
  });

  it("경로 토큰과 Bearer 둘 다 받는다", async () => {
    const a = await rpc("/mcp/secret-token", "tools/list", {});
    expect(a.status).toBe(200);
    expect(a.body.result.tools.map((t: { name: string }) => t.name)).toEqual([
      "kcsc_search",
      "kcsc_outline",
      "kcsc_read",
      "kcsc_find_in_document",
      "kcsc_formula",
    ]);
    const b = await rpc("/mcp", "tools/list", {}, { Authorization: "Bearer secret-token" });
    expect(b.status).toBe(200);
  });

  it("kcsc_read 로 절을 읽는다", async () => {
    const r = await rpc("/mcp/secret-token", "tools/call", {
      name: "kcsc_read",
      arguments: { code: "KCS 14 20 12", section: "3.3" },
    });
    const t = r.body.result.content[0].text as string;
    expect(t).toContain("# 거푸집 및 동바리 (KCS 14 20 12)");
    expect(t).toContain("[KCS 14 20 12 / 2024판] 3.3절");
    expect(t).toContain("kcsc_formula");
  });

  it("kcsc_find_in_document 가 절을 짚는다", async () => {
    const r = await rpc("/mcp/secret-token", "tools/call", {
      name: "kcsc_find_in_document",
      arguments: { code: "KCS 14 20 12", keyword: "존치기간" },
    });
    expect(r.body.result.content[0].text).toContain("### 3.3 거푸집 해체");
  });

  it("kcsc_formula 가 그림을 돌려준다", async () => {
    const r = await rpc("/mcp/secret-token", "tools/call", {
      name: "kcsc_formula",
      arguments: { code: "KCS 14 20 12", section: "3.3" },
    });
    const imgs = r.body.result.content.filter((c: { type: string }) => c.type === "image");
    expect(imgs).toHaveLength(2);
    expect(imgs[0].mimeType).toBe("image/gif");
  });

  it("틀린 키는 도구 오류로 알린다", async () => {
    vi.stubGlobal("fetch", mockFetch({ badKey: true }));
    const r = await rpc("/mcp/secret-token", "tools/call", { name: "kcsc_search", arguments: { query: "철근x" } });
    expect(r.body.result.isError).toBe(true);
    expect(r.body.result.content[0].text).toContain("인증키");
  });
});
