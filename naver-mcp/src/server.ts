/** MCP 도구 정의. 도구 이름은 기존 PlayMCP NaverSearch 와 맞춰 스킬 수정을 최소화한다. */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  NaverClient,
  NaverError,
  SEARCH_KINDS,
  cleanText,
  formatDate,
  sourceHost,
  summarizeTrend,
  type SearchKind,
} from "./naver";

const INSTRUCTIONS = `네이버 오픈API 로 국내 뉴스·블로그·카페·웹문서를 검색하고, 데이터랩으로 검색어 트렌드를 조회합니다.
- 최신 보도는 search_news 에 sort="date" 를 주십시오. 기본(sim)은 관련도 순이라 최신성이 보장되지 않습니다.
- datalab_search 의 값은 절대 검색량이 아니라 상대 지수입니다. 요청한 기간·그룹 전체에서 가장 높은 지점이 100 입니다.
  그룹끼리는 같은 요청 안에서만 비교할 수 있고, 다른 요청의 숫자와 비교하면 안 됩니다.
- 결과를 인용할 때는 매체·날짜·링크를 함께 적으십시오. 검색 요약(description)은 본문 일부일 뿐입니다.`;

type Content = { type: "text"; text: string };

function text(t: string) {
  return { content: [{ type: "text" as const, text: t }] satisfies Content[] };
}

async function guard(fn: () => Promise<{ content: Content[] }>) {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof NaverError) return { content: [{ type: "text" as const, text: `❌ ${e.message}` }], isError: true };
    throw e;
  }
}

/** 한국 시간 기준 오늘에서 days 일을 더한 날짜(yyyy-mm-dd). */
export function kstDate(days = 0, now = Date.now()): string {
  return new Date(now + 9 * 3600_000 + days * 86_400_000).toISOString().slice(0, 10);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function registerSearch(server: McpServer, client: NaverClient, kind: SearchKind) {
  const label = SEARCH_KINDS[kind];
  server.registerTool(
    `search_${kind}`,
    {
      title: `네이버 ${label} 검색`,
      description:
        `네이버 ${label} 검색. 공백으로 나눈 단어는 모두 포함하는 결과를 찾습니다. ` +
        (kind === "news" ? "최신 보도를 보려면 sort='date'." : "현장 반응·실무 사례 파악용."),
      inputSchema: {
        query: z.string().min(1).describe("검색어"),
        display: z.number().int().min(1).max(100).default(10).describe("결과 수 (최대 100)"),
        start: z.number().int().min(1).max(1000).default(1).describe("시작 위치 (페이지 넘김)"),
        sort: z.enum(["sim", "date"]).default(kind === "news" ? "date" : "sim").describe("sim=관련도순, date=최신순"),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    ({ query, display, start, sort }) =>
      guard(async () => {
        const r = await client.search(kind, query, { display, start, sort });
        if (!r.items?.length) {
          return text(`네이버 ${label}에서 "${query}" 결과가 없습니다. 단어 수를 줄이거나 다른 표현으로 다시 찾아 보세요.`);
        }
        const lines = r.items.map((it, i) => {
          const meta = [formatDate(it), kind === "news" ? sourceHost(it) : it.bloggername || it.cafename].filter(Boolean).join(" · ");
          const link = it.originallink || it.link;
          return `${start + i}. **${cleanText(it.title)}**${meta ? ` (${meta})` : ""}\n   ${cleanText(it.description)}\n   ${link}`;
        });
        return text(
          `네이버 ${label} "${query}" — 전체 약 ${r.total.toLocaleString()}건 중 ${start}~${start + r.items.length - 1}번 ` +
            `(${sort === "date" ? "최신순" : "관련도순"})\n\n${lines.join("\n\n")}`,
        );
      }),
  );
}

export function createServer(client: NaverClient): McpServer {
  const server = new McpServer({ name: "naver-mcp", version: "0.1.0" }, { instructions: INSTRUCTIONS });

  for (const kind of Object.keys(SEARCH_KINDS) as SearchKind[]) registerSearch(server, client, kind);

  server.registerTool(
    "datalab_search",
    {
      title: "네이버 데이터랩 검색어 트렌드",
      description:
        "네이버 통합검색에서 검색어 그룹별 검색량 추이(상대 지수, 최고점=100)를 조회합니다. " +
        "이슈가 기사로만 났는지, 실제로 관심이 커졌는지 가늠할 때 씁니다. 그룹은 최대 5개, 그룹당 검색어 최대 20개.",
      inputSchema: {
        keyword_groups: z
          .array(
            z.object({
              group_name: z.string().min(1).describe("그룹 이름 (예: '중대재해')"),
              keywords: z.array(z.string().min(1)).min(1).max(20).describe("이 그룹으로 합산할 검색어들"),
            }),
          )
          .min(1)
          .max(5),
        start_date: z.string().regex(DATE_RE).optional().describe("yyyy-mm-dd. 생략하면 90일 전 (2016-01-01 이후)"),
        end_date: z.string().regex(DATE_RE).optional().describe("yyyy-mm-dd. 생략하면 오늘"),
        time_unit: z.enum(["date", "week", "month"]).default("week").describe("date=일, week=주, month=월"),
        device: z.enum(["pc", "mo"]).optional().describe("생략하면 전체"),
        gender: z.enum(["m", "f"]).optional().describe("생략하면 전체"),
        ages: z
          .array(z.enum(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"]))
          .optional()
          .describe("연령 구간 코드. 1=0~12세, 2=13~18, 3=19~24, 4=25~29, 5=30~34, 6=35~39, 7=40~44, 8=45~49, 9=50~54, 10=55~59, 11=60세 이상"),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    ({ keyword_groups, start_date, end_date, time_unit, device, gender, ages }) =>
      guard(async () => {
        const startDate = start_date ?? kstDate(-90);
        const endDate = end_date ?? kstDate(0);
        if (startDate > endDate) throw new NaverError(`시작일(${startDate})이 종료일(${endDate})보다 늦습니다.`);
        if (startDate < "2016-01-01") throw new NaverError("데이터랩은 2016-01-01 이후만 조회할 수 있습니다.");
        const r = await client.datalab({
          startDate,
          endDate,
          timeUnit: time_unit,
          keywordGroups: keyword_groups.map((g) => ({ groupName: g.group_name, keywords: g.keywords })),
          ...(device ? { device } : {}),
          ...(gender ? { gender } : {}),
          ...(ages?.length ? { ages } : {}),
        });
        const unit = { date: "일", week: "주", month: "월" }[time_unit];
        const blocks = r.results.map((g) => {
          const s = summarizeTrend(g);
          if (s.points === 0) return `### ${g.title} (${g.keywords.join(", ")})\n데이터 없음 — 검색량이 집계 기준에 못 미칩니다.`;
          const trend =
            s.recentVsEarlier === null
              ? ""
              : ` · 최근 1/3 구간 평균이 앞 구간의 ${s.recentVsEarlier.toFixed(2)}배`;
          const series = g.data.map((d) => `${d.period} ${d.ratio.toFixed(1)}`).join(" | ");
          return [
            `### ${g.title} (${g.keywords.join(", ")})`,
            `최고 ${s.peak!.ratio.toFixed(1)} (${s.peak!.period}) · 최근 ${s.latest!.ratio.toFixed(1)} (${s.latest!.period}) · 평균 ${s.average.toFixed(1)}${trend}`,
            `${unit}별: ${series}`,
          ].join("\n");
        });
        const filters = [device && `기기 ${device}`, gender && `성별 ${gender}`, ages?.length && `연령 ${ages.join(",")}`]
          .filter(Boolean)
          .join(" · ");
        return text(
          [
            `네이버 데이터랩 검색어 트렌드 ${r.startDate} ~ ${r.endDate} (${unit} 단위${filters ? ` · ${filters}` : ""})`,
            ...blocks,
            "※ 상대 지수입니다. 이 요청의 전체 그룹·기간 중 최고점이 100 이며, 절대 검색 횟수가 아닙니다. 다른 요청의 값과 비교하지 마십시오.",
            `[출처: 네이버 데이터랩 · 조회일 ${kstDate(0)}]`,
          ].join("\n\n"),
        );
      }),
  );

  return server;
}
