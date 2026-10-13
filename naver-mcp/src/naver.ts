/**
 * 네이버 오픈API 클라이언트 — 검색(뉴스·블로그·카페·웹문서)과 데이터랩 검색어 트렌드.
 *
 *   GET  https://openapi.naver.com/v1/search/{kind}.json?query=&display=&start=&sort=
 *   POST https://openapi.naver.com/v1/datalab/search
 *   헤더: X-Naver-Client-Id / X-Naver-Client-Secret
 *
 * 하루 호출 한도(앱 기준): 검색 25,000회, 데이터랩 1,000회.
 */

export const API_BASE = "https://openapi.naver.com/v1";
const TIMEOUT_MS = 15_000;

/** 사용자에게 그대로 보여 줄 수 있는 오류. */
export class NaverError extends Error {}

export const SEARCH_KINDS = {
  news: "뉴스",
  blog: "블로그",
  cafearticle: "카페글",
  webkr: "웹문서",
} as const;
export type SearchKind = keyof typeof SEARCH_KINDS;

export interface SearchItem {
  title: string;
  link: string;
  originallink?: string;
  description: string;
  pubDate?: string;
  postdate?: string;
  bloggername?: string;
  cafename?: string;
}

export interface SearchResult {
  total: number;
  start: number;
  display: number;
  items: SearchItem[];
}

export interface KeywordGroup {
  groupName: string;
  keywords: string[];
}

export interface DatalabRequest {
  startDate: string;
  endDate: string;
  timeUnit: "date" | "week" | "month";
  keywordGroups: KeywordGroup[];
  device?: "pc" | "mo";
  gender?: "m" | "f";
  ages?: string[];
}

export interface DatalabResult {
  startDate: string;
  endDate: string;
  timeUnit: string;
  results: { title: string; keywords: string[]; data: { period: string; ratio: number }[] }[];
}

export class NaverClient {
  constructor(
    private readonly clientId: string | undefined,
    private readonly clientSecret: string | undefined,
    // ★fetch 를 그대로 속성에 담아 this.fetchImpl() 로 부르면 workerd 에서 Illegal invocation 이 난다.
    private readonly fetchImpl: typeof fetch = (input, init) => fetch(input, init),
  ) {}

  private headers(): Record<string, string> {
    if (!this.clientId || !this.clientSecret) {
      throw new NaverError(
        "네이버 API 키가 설정되지 않았습니다. 관리자가 `wrangler secret put NAVER_CLIENT_ID` / `NAVER_CLIENT_SECRET` 로 넣어야 합니다.\n" +
          "발급: https://developers.naver.com → Application 등록 → 사용 API에 '검색'과 '데이터랩(검색어트렌드)' 추가",
      );
    }
    return { "X-Naver-Client-Id": this.clientId, "X-Naver-Client-Secret": this.clientSecret };
  }

  private async call<T>(url: string, init: RequestInit): Promise<T> {
    let res: Response;
    try {
      res = await this.fetchImpl(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (e) {
      const why = e instanceof Error && e.name === "TimeoutError" ? `${TIMEOUT_MS / 1000}초 안에 응답 없음` : String(e);
      throw new NaverError(`네이버 API 에 연결하지 못했습니다: ${why}`);
    }
    const raw = await res.text();
    let body: unknown = null;
    try {
      body = JSON.parse(raw);
    } catch {
      /* 아래에서 처리 */
    }
    if (!res.ok) {
      const b = (body ?? {}) as { errorMessage?: string; errorCode?: string };
      const detail = b.errorMessage ? `${b.errorMessage}${b.errorCode ? ` (${b.errorCode})` : ""}` : raw.slice(0, 200);
      if (res.status === 401) throw new NaverError(`네이버 인증 실패 (HTTP 401): ${detail}. Client ID/Secret 을 확인해 주세요.`);
      if (res.status === 403) {
        throw new NaverError(
          `네이버가 호출을 거부했습니다 (HTTP 403): ${detail}.\n` +
            "개발자센터의 애플리케이션 설정에서 이 API(검색 또는 데이터랩)가 '사용 API'에 추가돼 있는지 확인해 주세요.",
        );
      }
      if (res.status === 429) throw new NaverError(`네이버 일일 호출 한도를 넘었습니다 (HTTP 429): ${detail}. 내일 다시 시도해 주세요.`);
      throw new NaverError(`네이버 API 오류 HTTP ${res.status}: ${detail}`);
    }
    if (body === null) throw new NaverError(`네이버 응답을 JSON 으로 읽지 못했습니다: ${raw.slice(0, 200)}`);
    return body as T;
  }

  async search(kind: SearchKind, query: string, opts: { display?: number; start?: number; sort?: "sim" | "date" } = {}) {
    const p = new URLSearchParams({
      query,
      display: String(opts.display ?? 10),
      start: String(opts.start ?? 1),
      sort: opts.sort ?? "sim",
    });
    return this.call<SearchResult>(`${API_BASE}/search/${kind}.json?${p}`, { headers: this.headers() });
  }

  async datalab(req: DatalabRequest) {
    return this.call<DatalabResult>(`${API_BASE}/datalab/search`, {
      method: "POST",
      headers: { ...this.headers(), "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
  }
}

// ── 표시용 도우미 ──────────────────────────────────────────────────────────────

/** 검색 결과의 <b> 강조 태그와 HTML 엔티티를 걷어 낸다. */
export function cleanText(s: string | undefined): string {
  return (s ?? "")
    .replace(/<\/?b>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** 'Mon, 13 Oct 2026 09:30:00 +0900' 또는 '20261013' → '2026-10-13 09:30' / '2026-10-13'. KST 로 표시한다. */
export function formatDate(item: SearchItem): string {
  if (item.postdate && /^\d{8}$/.test(item.postdate)) {
    return `${item.postdate.slice(0, 4)}-${item.postdate.slice(4, 6)}-${item.postdate.slice(6, 8)}`;
  }
  if (!item.pubDate) return "";
  const t = Date.parse(item.pubDate);
  if (Number.isNaN(t)) return item.pubDate;
  const kst = new Date(t + 9 * 3600_000).toISOString();
  return `${kst.slice(0, 10)} ${kst.slice(11, 16)}`;
}

/** 'n.news.naver.com' 이 아닌 원문 링크의 도메인 → 언론사 추정용. */
export function sourceHost(item: SearchItem): string {
  const url = item.originallink || item.link;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export interface TrendSummary {
  title: string;
  keywords: string[];
  points: number;
  peak: { period: string; ratio: number } | null;
  latest: { period: string; ratio: number } | null;
  average: number;
  /** 마지막 구간 평균 ÷ 앞 구간 평균. 1 보다 크면 최근에 관심이 늘었다. */
  recentVsEarlier: number | null;
}

/** 데이터랩 결과 그룹 하나를 요약한다. 구간을 셋으로 나눠 마지막 1/3 을 앞 2/3 와 비교한다. */
export function summarizeTrend(g: DatalabResult["results"][number]): TrendSummary {
  const data = g.data ?? [];
  const n = data.length;
  if (n === 0) {
    return { title: g.title, keywords: g.keywords, points: 0, peak: null, latest: null, average: 0, recentVsEarlier: null };
  }
  const peak = data.reduce((a, b) => (b.ratio > a.ratio ? b : a));
  const avg = (xs: { ratio: number }[]) => (xs.length ? xs.reduce((s, x) => s + x.ratio, 0) / xs.length : 0);
  const cut = Math.max(1, Math.floor((n * 2) / 3));
  const earlier = avg(data.slice(0, cut));
  const recent = avg(data.slice(cut));
  return {
    title: g.title,
    keywords: g.keywords,
    points: n,
    peak,
    latest: data[n - 1]!,
    average: avg(data),
    recentVsEarlier: n >= 3 && earlier > 0 ? recent / earlier : null,
  };
}
