/** MCP 도구 정의. 설계기준(KDS)·표준시방서(KCS)·전문시방서를 찾고, 목차를 보고, 절을 읽는다. */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CODE_TYPES, CODE_TYPE_NAMES, DEFAULT_MAX_CHARS, VIEWER_URL, type CodeType } from "./config";
import { KcscClient, KcscError, formatCode, parentNames, type CatalogEntry } from "./kcsc";
import {
  FORMULA_NOTICE,
  clauses,
  header,
  outline,
  renderItems,
  sectionItems,
  snippets,
  sourceTag,
  truncate,
  items as docItems,
  type ImageRef,
} from "./render";

const INSTRUCTIONS = `국가건설기준센터(KCSC) OpenAPI 로 건설기준 원문을 조회합니다.
- KDS = 설계기준, KCS = 표준시방서, SMCS·LHCS·EXCS·KRCCS·KWCS·NHCS·KRACS = 기관별 전문시방서.
- 순서: 코드를 모르면 kcsc_search → kcsc_outline 으로 목차 확인 → kcsc_read 로 필요한 절만 읽기.
  특정 용어가 어느 절에 있는지 모르면 kcsc_find_in_document.
- 답변에는 도구가 준 출처 태그(예: [KDS 14 20 10 / 2024판])와 절 번호를 반드시 붙이십시오.
- 수식은 원문에 그림으로만 있습니다(〔그림 N〕). 식을 기억으로 재구성하지 말고 kcsc_formula 로 그림을 확인하십시오.
- 건설공사 표준품셈은 이 API 범위가 아닙니다.`;

const codeTypeSchema = z
  .enum(CODE_TYPES)
  .optional()
  .describe("기준 종류. 생략하면 코드에 붙은 접두어를 쓰고, 그것도 없으면 KDS→KCS 순으로 고른 뒤 다른 후보를 알려 줍니다.");
const codeSchema = z.string().min(1).describe("기준 코드. 예: 'KDS 14 20 10', 'KCS 14 20 10', '142010'");

type Content = { type: "text"; text: string } | { type: "image"; data: string; mimeType: string };

function text(t: string) {
  return { content: [{ type: "text" as const, text: t }] };
}

async function guard(fn: () => Promise<{ content: Content[] }>) {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof KcscError) return { content: [{ type: "text" as const, text: `❌ ${e.message}` }], isError: true };
    throw e;
  }
}

// ── 카탈로그 검색 ─────────────────────────────────────────────────────────────
export function searchCatalog(all: CatalogEntry[], query: string, codeType?: CodeType, limit = 20) {
  const q = query.trim().toLowerCase();
  const digits = q.replace(/[^\d]/g, "");
  const tokens = q
    .replace(new RegExp(`\\b(${CODE_TYPES.join("|")})\\b`, "gi"), " ")
    .split(/\s+/)
    .filter((t) => t && !/^\d+$/.test(t));
  const typeInQuery = CODE_TYPES.find((t) => new RegExp(`\\b${t}\\b`, "i").test(query));
  const wantType = codeType ?? typeInQuery;

  const scored: { e: CatalogEntry; score: number }[] = [];
  for (const e of all) {
    if (wantType && e.codeType.toUpperCase() !== wantType) continue;
    const name = e.name.toLowerCase();
    const parents = parentNames(e).join(" ").toLowerCase();
    let score = 0;
    if (digits.length >= 2) {
      if (e.code === digits) score += 100;
      else if (e.code.startsWith(digits)) score += 40;
      else if (!tokens.length) continue;
    }
    let ok = true;
    for (const t of tokens) {
      if (name.includes(t)) score += name === t ? 30 : 10;
      else if (parents.includes(t)) score += 3;
      else ok = false;
    }
    if (!ok || score === 0) continue;
    if (e.codeType === "KDS" || e.codeType === "KCS") score += 2; // 국가기준 우선
    if (/0000$/.test(e.code)) score -= 1; // 상위 분류 노드는 뒤로
    scored.push({ e, score });
  }
  const rank = (t: string) => (CODE_TYPES as readonly string[]).indexOf(t.toUpperCase());
  scored.sort((a, b) => b.score - a.score || rank(a.e.codeType) - rank(b.e.codeType) || a.e.code.localeCompare(b.e.code));
  return { total: scored.length, hits: scored.slice(0, limit).map((s) => s.e) };
}

export function createServer(client: KcscClient): McpServer {
  const server = new McpServer({ name: "kcsc-mcp", version: "0.1.0" }, { instructions: INSTRUCTIONS });

  server.registerTool(
    "kcsc_search",
    {
      title: "건설기준 검색",
      description:
        "설계기준(KDS)·표준시방서(KCS)·전문시방서를 이름·코드로 찾습니다. 기준 이름과 상위 분류명에서 찾으며, 본문 검색은 아닙니다. " +
        "예: '콘크리트 구조 설계', 'KCS 거푸집', '14 20', '흙막이'. 여러 단어는 모두 포함하는 것만 돌려줍니다.",
      inputSchema: {
        query: z.string().min(1).describe("검색어 또는 코드 일부"),
        code_type: z.enum(CODE_TYPES).optional().describe("종류로 좁히기 (KDS=설계기준, KCS=표준시방서 등)"),
        limit: z.number().int().min(1).max(50).default(20),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    ({ query, code_type, limit }) =>
      guard(async () => {
        const { total, hits } = searchCatalog(await client.catalog(), query, code_type, limit);
        if (hits.length === 0) {
          return text(
            `"${query}" 로 찾은 기준이 없습니다. 더 짧은 단어(예: '거푸집', '말뚝')나 코드 앞자리(예: '14 20')로 다시 찾아 보세요.`,
          );
        }
        const lines = hits.map((e) => {
          const p = parentNames(e).slice(-2).join(" › ");
          return `- **${formatCode(e.codeType, e.code)}** ${e.name} — ${e.version ?? "?"}판${p ? ` · ${p}` : ""}`;
        });
        return text(`검색 결과 ${total}건${total > hits.length ? ` (상위 ${hits.length}건)` : ""}\n\n${lines.join("\n")}`);
      }),
  );

  server.registerTool(
    "kcsc_outline",
    {
      title: "기준 목차",
      description: "기준 한 건의 판(연도)·개정일과 조항 목차를 보여 줍니다. 본문을 읽기 전에 필요한 절 번호를 고를 때 씁니다.",
      inputSchema: {
        code: codeSchema,
        code_type: codeTypeSchema,
        depth: z.number().int().min(1).max(6).default(3).describe("목차 깊이. 2면 '1.2' 까지"),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    ({ code, code_type, depth }) =>
      guard(async () => {
        const { doc, notice } = await client.document(code, code_type);
        const toc = outline(doc, depth).map((o) => `${"  ".repeat(o.depth - 1)}- ${o.title || o.no}`);
        return text(
          [
            notice,
            header(doc),
            `종류: ${CODE_TYPE_NAMES[doc.codeType as CodeType] ?? doc.codeType} · 항목 ${doc.list.length.toLocaleString()}개`,
            "## 목차",
            toc.length ? toc.join("\n") : "(조항 머리를 찾지 못했습니다. kcsc_read 로 전체를 읽어 보세요.)",
            `출처 태그: ${sourceTag(doc)}`,
          ]
            .filter(Boolean)
            .join("\n\n"),
        );
      }),
  );

  server.registerTool(
    "kcsc_read",
    {
      title: "기준 본문 읽기",
      description:
        "기준 본문을 마크다운으로 읽습니다. section 에 절 번호(예: '3.2', '4.1.2')를 주면 그 절과 하위 절만 돌려줍니다. " +
        "표는 마크다운 표로 보존하고, 수식 그림은 〔그림 N〕 자리표로 표시합니다.",
      inputSchema: {
        code: codeSchema,
        code_type: codeTypeSchema,
        section: z.string().optional().describe("절 번호. 생략하면 문서 전체(길면 잘림)"),
        max_chars: z.number().int().min(1000).max(100_000).default(DEFAULT_MAX_CHARS),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    ({ code, code_type, section, max_chars }) =>
      guard(async () => {
        const { doc, notice } = await client.document(code, code_type);
        const its = section ? sectionItems(doc, section) : docItems(doc);
        if (its.length === 0) {
          const near = outline(doc, 2).map((o) => o.no).join(", ");
          return text(`${header(doc)}\n\n절 "${section}" 을 찾지 못했습니다. 이 기준의 절: ${near}\nkcsc_outline 으로 목차를 확인해 주세요.`);
        }
        const images: ImageRef[] = [];
        const { text: body, hasFormula } = renderItems(its, images);
        const hint = section
          ? "더 좁은 하위 절 번호로 다시 읽어 주세요."
          : "kcsc_outline 으로 목차를 보고 section 을 지정해 읽어 주세요.";
        return text(
          [
            notice,
            header(doc),
            truncate(body, max_chars, hint),
            hasFormula ? FORMULA_NOTICE : "",
            `출처 태그: ${sourceTag(doc)}${section ? ` ${section}절` : ""}`,
          ]
            .filter(Boolean)
            .join("\n\n"),
        );
      }),
  );

  server.registerTool(
    "kcsc_find_in_document",
    {
      title: "기준 안에서 용어 찾기",
      description:
        "기준 한 건의 본문(표 포함)에서 용어가 나오는 절을 찾아 앞뒤 문맥과 함께 보여 줍니다. 예: 'KCS 14 20 12' 에서 '존치기간'.",
      inputSchema: {
        code: codeSchema,
        keyword: z.string().min(1).describe("찾을 용어"),
        code_type: codeTypeSchema,
        limit: z.number().int().min(1).max(30).default(10).describe("돌려줄 절 수 상한"),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    ({ code, keyword, code_type, limit }) =>
      guard(async () => {
        const { doc, notice } = await client.document(code, code_type);
        const kw = keyword.toLowerCase();
        const hits = clauses(doc).filter((c) => `${c.title}\n${c.text}`.toLowerCase().includes(kw));
        if (hits.length === 0) {
          return text(`${notice ? `${notice}\n\n` : ""}${header(doc)}\n\n"${keyword}" 는 이 기준 본문에 없습니다.`);
        }
        const blocks = hits.slice(0, limit).map((c) => {
          const s = snippets(c.text, keyword, 2);
          return `### ${c.title}\n${s.length ? s.map((x) => `> ${x}`).join("\n") : "> (절 제목에서 일치)"}`;
        });
        return text(
          [
            notice,
            header(doc),
            `"${keyword}" — ${hits.length}개 절에서 발견${hits.length > limit ? ` (상위 ${limit}개)` : ""}`,
            blocks.join("\n\n"),
            "전문은 kcsc_read 에 절 번호를 주어 읽으십시오.",
          ]
            .filter(Boolean)
            .join("\n\n"),
        );
      }),
  );

  server.registerTool(
    "kcsc_formula",
    {
      title: "수식 원본 그림",
      description:
        "kcsc_read 본문의 〔그림 N〕 에 해당하는 원본 수식·기호 그림을 이미지로 돌려줍니다. " +
        "code·section 은 kcsc_read 와 같게 주어야 번호가 맞습니다.",
      inputSchema: {
        code: codeSchema,
        section: z.string().min(1).describe("kcsc_read 에 준 것과 같은 절 번호"),
        code_type: codeTypeSchema,
        from: z.number().int().min(1).default(1).describe("시작 그림 번호"),
        count: z.number().int().min(1).max(30).default(10).describe("돌려줄 그림 수"),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    ({ code, section, code_type, from, count }) =>
      guard(async () => {
        const { doc, notice } = await client.document(code, code_type);
        const its = sectionItems(doc, section);
        if (its.length === 0) return text(`절 "${section}" 을 찾지 못했습니다. kcsc_outline 으로 확인해 주세요.`);
        const images: ImageRef[] = [];
        renderItems(its, images);
        if (images.length === 0) return text(`${sourceTag(doc)} ${section}절에는 수식 그림이 없습니다.`);
        const picked = images.slice(from - 1, from - 1 + count);
        if (picked.length === 0) return text(`그림은 1~${images.length}번까지 있습니다.`);
        const content: Content[] = [
          {
            type: "text",
            text:
              `${notice ? `${notice}\n\n` : ""}${sourceTag(doc)} ${section}절 수식 그림 ${from}~${from + picked.length - 1}번 ` +
              `(전체 ${images.length}개). 원문: ${VIEWER_URL}/${doc.no}`,
          },
        ];
        picked.forEach((img, i) => {
          content.push({ type: "text", text: `〔그림 ${from + i}〕` });
          content.push({ type: "image", data: img.data, mimeType: img.mimeType });
        });
        return { content };
      }),
  );

  return server;
}
