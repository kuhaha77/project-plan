/**
 * KCSC(국가건설기준센터) OpenAPI 클라이언트.
 *
 *   GET {BASE}/CodeList?key={KEY}                  → 카탈로그(약 3,500건)
 *   GET {BASE}/CodeViewer/{Type}/{Code}?key={KEY}  → 본문 (Type·Code 는 경로, key 는 소문자 쿼리)
 *
 * 알려진 함정과 대응:
 *  - 인증키가 틀려도 HTTP 200 에 필드가 전부 null 인 한 건이 온다 → rejectNullSentinel 로 막는다.
 *    막지 않으면 빈 카탈로그가 캐시에 남아 이후 모든 조회가 조용히 "못 찾음"이 된다.
 *  - 6자리 코드는 종류끼리 겹친다 → resolve 가 국가기준을 고르되 고른 사실과 후보를 알린다.
 *  - 상위 분류(xx0000) 노드는 본문이 없다 → 그렇다고 말한다.
 *  - CodeViewer 응답이 길이 1 배열로 감싸여 올 수 있다 → 벗긴다.
 */
import { BASE_URL, CATALOG_TTL_SEC, CODE_TYPES, DOC_TTL_SEC, FETCH_TIMEOUT_MS, type CodeType } from "./config";

/** 사용자에게 그대로 보여 줄 수 있는 오류. 원인과 다음 행동을 함께 담는다. */
export class KcscError extends Error {}

export interface ParentCode {
  codeType?: string | null;
  fullCode?: string | null;
  name?: string | null;
}

export interface CatalogEntry {
  no: number;
  codeType: string;
  code: string;
  fullCode?: string | null;
  name: string;
  version?: string | null;
  updateDate?: string | null;
  listParentCodes?: ParentCode[] | null;
}

export interface DocItem {
  no?: number;
  sort?: number | null;
  title?: string | null;
  level?: number | null;
  label?: string | null;
  contents?: string | null;
}

export interface KcscDocument extends CatalogEntry {
  list: DocItem[];
}

/** 캐시 저장소. KV 를 묶으면 KV, 아니면 isolate 메모리만 쓴다. */
export interface Store {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, ttlSec: number): Promise<void>;
}

const memory = new Map<string, { value: string; expires: number }>();

/** 테스트용: isolate 메모리 캐시를 비운다. */
export function resetMemoryCache(): void {
  memory.clear();
}

export function makeStore(kv?: KVNamespace): Store {
  return {
    async get(key) {
      const hit = memory.get(key);
      if (hit && hit.expires > Date.now()) return hit.value;
      if (!kv) return null;
      const v = await kv.get(key);
      if (v !== null) memory.set(key, { value: v, expires: Date.now() + 10 * 60_000 });
      return v;
    },
    async put(key, value, ttlSec) {
      memory.set(key, { value, expires: Date.now() + ttlSec * 1000 });
      if (kv) await kv.put(key, value, { expirationTtl: Math.max(60, ttlSec) });
    },
  };
}

// ── 코드 표기 정규화 ──────────────────────────────────────────────────────────
const TYPE_RE = new RegExp(`^\\s*(${CODE_TYPES.join("|")})(?![A-Z])`, "i");

/** 'KDS 14 31 10' → { type:'KDS', digits:'143110' }. 종류가 없으면 type 은 null. */
export function normalizeCode(text: string): { type: CodeType | null; digits: string } {
  let s = (text ?? "").trim();
  if (!s) throw new KcscError("기준 코드가 비어 있습니다. 예: `KDS 14 20 10` 또는 `142010`");
  let type: CodeType | null = null;
  const m = TYPE_RE.exec(s);
  if (m) {
    type = m[1]!.toUpperCase() as CodeType;
    s = s.slice(m[0].length);
  }
  // 'KDS 14 20 10 : 2022' 처럼 판(연도)을 붙여 쓰는 경우가 많다. 연도는 코드가 아니다.
  s = s.replace(/\s*[:(（/]\s*(19|20)\d{2}.*$/, "");
  const digits = s.replace(/\D/g, "");
  if (digits.length !== 6 && digits.length !== 8) {
    throw new KcscError(
      `기준 코드는 숫자 6자리 또는 8자리입니다 (받은 값: "${text}" → 숫자 ${digits.length}자리).\n` +
        "예: `KDS 14 20 10` · `14 20 10` · `142010`",
    );
  }
  return { type, digits };
}

export function formatCode(type: string, code: string): string {
  return `${type} ${code.replace(/(\d{2})(?=\d)/g, "$1 ")}`;
}

// ── HTTP ─────────────────────────────────────────────────────────────────────
export class KcscClient {
  constructor(
    private readonly apiKey: string | undefined,
    private readonly store: Store,
    // ★fetch 를 그대로 속성에 담아 this.fetchImpl() 로 부르면 workerd 에서 Illegal invocation 이 난다.
    private readonly fetchImpl: typeof fetch = (input, init) => fetch(input, init),
  ) {}

  private async fetchJson(path: string): Promise<unknown> {
    if (!this.apiKey) {
      throw new KcscError(
        "KCSC 인증키가 설정되지 않았습니다. 관리자가 `wrangler secret put KCSC_API_KEY` 로 넣어야 합니다.\n" +
          "키 발급: 국가건설기준센터 https://www.kcsc.re.kr → OpenAPI 신청",
      );
    }
    const url = `${BASE_URL}/${path}?key=${encodeURIComponent(this.apiKey)}`;
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        headers: { "User-Agent": "kcsc-mcp-worker", Accept: "application/json" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch (e) {
      const why = e instanceof Error && e.name === "TimeoutError" ? `${FETCH_TIMEOUT_MS / 1000}초 안에 응답 없음` : String(e);
      throw new KcscError(`KCSC 서버에 연결하지 못했습니다: ${why}`);
    }
    if (res.status === 401 || res.status === 403) {
      throw new KcscError(
        `KCSC 가 요청을 거부했습니다 (HTTP ${res.status}). KCSC_API_KEY 값, 또는 KCSC 측 IP·트래픽 차단 여부를 확인해 주세요.`,
      );
    }
    if (!res.ok) throw new KcscError(`KCSC 서버 응답 오류 HTTP ${res.status}`);
    const raw = await res.text();
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new KcscError(`KCSC 응답을 JSON 으로 읽지 못했습니다: ${raw.slice(0, 200)}`);
    }
    rejectNullSentinel(data);
    return data;
  }

  // ── 카탈로그 ───────────────────────────────────────────────────────────────
  private catalogMemo: CatalogEntry[] | null = null;

  async catalog(refresh = false): Promise<CatalogEntry[]> {
    if (!refresh && this.catalogMemo) return this.catalogMemo;
    if (!refresh) {
      const cached = await this.store.get("catalog:v1");
      if (cached) {
        const parsed = JSON.parse(cached) as CatalogEntry[];
        if (looksLikeCatalog(parsed)) return (this.catalogMemo = parsed);
      }
    }
    const data = await this.fetchJson("CodeList");
    if (!looksLikeCatalog(data)) {
      throw new KcscError("카탈로그 응답이 온전하지 않습니다. 잠시 후 다시 시도해 주세요.");
    }
    const slim = (data as CatalogEntry[]).map(slimEntry);
    await this.store.put("catalog:v1", JSON.stringify(slim), CATALOG_TTL_SEC);
    return (this.catalogMemo = slim);
  }

  async find(code: string, codeType?: string | null): Promise<CatalogEntry[]> {
    const { type, digits } = normalizeCode(code);
    const want = (codeType || type || "").toUpperCase() || null;
    const all = await this.catalog();
    return all.filter((e) => String(e.code) === digits && (!want || String(e.codeType).toUpperCase() === want));
  }

  /** 카탈로그 항목 한 건으로 확정한다. 후보가 여럿이면 국가기준을 고르고 notice 로 알린다. */
  async resolve(code: string, codeType?: string | null): Promise<{ entry: CatalogEntry; notice: string }> {
    const { type, digits } = normalizeCode(code);
    const want = (codeType || type || "").toUpperCase() || null;
    if (want && !(CODE_TYPES as readonly string[]).includes(want)) {
      throw new KcscError(`모르는 기준 종류 "${want}". 가능: ${CODE_TYPES.join(" · ")}`);
    }
    const hits = await this.find(code, want);
    if (hits.length === 0) {
      const label = want ? `${want} ${digits}` : `코드 ${digits}`;
      throw new KcscError(`${label} 를 카탈로그에서 찾지 못했습니다. kcsc_search 로 먼저 찾아 주세요.`);
    }
    if (hits.length === 1) return { entry: hits[0]!, notice: "" };
    const rank = (t: string) => {
      const i = (CODE_TYPES as readonly string[]).indexOf(t.toUpperCase());
      return i < 0 ? 99 : i;
    };
    hits.sort((a, b) => rank(a.codeType) - rank(b.codeType));
    const [chosen, ...rest] = hits as [CatalogEntry, ...CatalogEntry[]];
    const others = rest.map((h) => `${formatCode(h.codeType, h.code)} 「${h.name}」`).join(" · ");
    return {
      entry: chosen,
      notice:
        `> ℹ️ 코드 ${digits} 는 여러 종류에 있습니다. **${chosen.codeType}** 로 읽었습니다.\n` +
        `> 다른 후보: ${others}\n> 다른 것을 보려면 code_type 을 지정하세요.`,
    };
  }

  // ── 본문 ───────────────────────────────────────────────────────────────────
  async document(code: string, codeType?: string | null): Promise<{ doc: KcscDocument; notice: string }> {
    const { entry, notice } = await this.resolve(code, codeType);
    const key = `doc:v1:${entry.codeType}:${entry.code}:${entry.version ?? ""}`;
    const cached = await this.store.get(key);
    if (cached) return { doc: JSON.parse(cached) as KcscDocument, notice };

    let data = await this.fetchJson(`CodeViewer/${entry.codeType}/${entry.code}`);
    if (Array.isArray(data)) data = data[0];
    const doc = data as Partial<KcscDocument> | undefined;
    if (!doc || typeof doc !== "object" || !Array.isArray(doc.list) || doc.list.length === 0) {
      throw new KcscError(
        `${formatCode(entry.codeType, entry.code)} 「${entry.name}」 에는 본문이 없습니다.\n` +
          "상위 분류 노드이거나 본문이 공개되지 않은 항목입니다. kcsc_search 로 하위 기준을 찾아 주세요.",
      );
    }
    const full: KcscDocument = {
      ...entry,
      ...doc,
      codeType: doc.codeType || entry.codeType,
      code: String(doc.code || entry.code),
      name: doc.name || entry.name,
      no: doc.no || entry.no,
      list: doc.list,
    };
    await this.store.put(key, JSON.stringify(full), DOC_TTL_SEC);
    return { doc: full, notice };
  }
}

/** 키가 틀리면 KCSC 는 `[{"no":0,"codeType":null,...}]` 를 HTTP 200 으로 준다. 이걸 오류로 바꾼다. */
export function rejectNullSentinel(data: unknown): void {
  const one = Array.isArray(data) && data.length === 1 ? data[0] : !Array.isArray(data) ? data : null;
  if (one && typeof one === "object" && (one as { no?: unknown }).no === 0 && (one as { codeType?: unknown }).codeType == null) {
    throw new KcscError(
      "인증키가 거부되었습니다. KCSC_API_KEY 값을 확인해 주세요.\n" +
        "(KCSC 는 키가 틀려도 오류코드 대신 빈 레코드를 돌려줍니다.)",
    );
  }
}

function looksLikeCatalog(data: unknown): data is CatalogEntry[] {
  return Array.isArray(data) && data.length > 100 && typeof data[0] === "object" && !!(data[0] as CatalogEntry).codeType;
}

function slimEntry(e: CatalogEntry): CatalogEntry {
  return {
    no: e.no,
    codeType: e.codeType,
    code: String(e.code),
    fullCode: e.fullCode ?? null,
    name: e.name,
    version: e.version ?? null,
    updateDate: e.updateDate ?? null,
    listParentCodes: (e.listParentCodes ?? []).map((p) => ({ name: p.name ?? null })),
  };
}

export function parentNames(e: CatalogEntry): string[] {
  return (e.listParentCodes ?? []).map((p) => p.name ?? "").filter(Boolean);
}
