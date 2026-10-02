/**
 * KCSC 본문 HTML → 마크다운.
 *
 * 지키는 것 두 가지.
 *  - 표를 보존한다. 기준의 수치는 대부분 표에 있다.
 *  - 수식을 지어내지 않는다. KCSC 의 수식·기호는 alt 없는 base64 GIF 라 텍스트가 없다.
 *    본문에는 〔그림 N〕 자리표만 남기고, 원본 그림은 kcsc_formula 가 그대로 돌려준다.
 *    번호는 같은 범위를 읽으면 kcsc_read 와 kcsc_formula 에서 항상 같다(등장 순서).
 */
import { parse, NodeType, type HTMLElement, type Node } from "node-html-parser";
import type { DocItem, KcscDocument } from "./kcsc";
import { formatCode } from "./kcsc";
import { VIEWER_URL } from "./config";

export interface ImageRef {
  data: string; // base64
  mimeType: string;
}

const SUPS: Record<string, string> = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
  "+": "⁺", "-": "⁻", n: "ⁿ",
};
const SUBS: Record<string, string> = {
  "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉",
};

const BLOCK = new Set([
  "p", "div", "li", "ul", "ol", "h1", "h2", "h3", "h4", "h5", "h6", "section", "article", "blockquote", "pre", "dl", "dt", "dd",
]);

const DATA_URI = /^data:(image\/[\w.+-]+);base64,(.+)$/s;

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, "&");
}

class Renderer {
  constructor(private readonly images: ImageRef[] | null) {}

  /** 이미지 자리표. images 를 모으는 중이면 번호를 매긴다. */
  private image(el: HTMLElement): string {
    const m = DATA_URI.exec((el.getAttribute("src") ?? "").trim());
    if (!m) return "〔그림〕";
    if (!this.images) return "〔그림〕";
    this.images.push({ mimeType: m[1]!.toLowerCase(), data: m[2]!.replace(/\s+/g, "") });
    return `〔그림 ${this.images.length}〕`;
  }

  private script(el: HTMLElement, table: Record<string, string>, mark: string): string {
    const t = this.children(el).replace(/\s+/g, "");
    if (!t) return "";
    return [...t].every((c) => c in table) ? [...t].map((c) => table[c]).join("") : `${mark}${t}`;
  }

  private table(el: HTMLElement): string {
    const rows: string[][] = [];
    for (const tr of el.querySelectorAll("tr")) {
      const cells: string[] = [];
      for (const cell of tr.childNodes) {
        if (cell.nodeType !== NodeType.ELEMENT_NODE) continue;
        const c = cell as HTMLElement;
        const tag = c.rawTagName?.toLowerCase();
        if (tag !== "td" && tag !== "th") continue;
        const text = this.children(c).replace(/\s*\n\s*/g, " ").replace(/\s+/g, " ").trim().replace(/\|/g, "\\|");
        cells.push(text);
        // 병합 셀은 빈 칸으로 채워 열 위치를 맞춘다(값은 첫 칸에만 있다).
        const span = Number(c.getAttribute("colspan") ?? 1);
        for (let i = 1; i < Math.min(span, 20); i++) cells.push("");
      }
      if (cells.some(Boolean)) rows.push(cells);
    }
    if (rows.length === 0) return "";
    const width = Math.max(...rows.map((r) => r.length));
    const norm = rows.map((r) => [...r, ...Array(width - r.length).fill("")]);
    const out: string[] = [];
    const cap = el.querySelector("caption");
    if (cap) out.push(`**${this.children(cap).replace(/\s+/g, " ").trim()}**`);
    out.push(`| ${norm[0]!.join(" | ")} |`);
    out.push(`| ${Array(width).fill("---").join(" | ")} |`);
    for (const r of norm.slice(1)) out.push(`| ${r.join(" | ")} |`);
    return `\n\n${out.join("\n")}\n\n`;
  }

  children(el: HTMLElement): string {
    return el.childNodes.map((n) => this.node(n)).join("");
  }

  node(n: Node): string {
    if (n.nodeType === NodeType.TEXT_NODE) return decodeEntities(n.rawText).replace(/[ \t\r\n]+/g, " ");
    if (n.nodeType !== NodeType.ELEMENT_NODE) return "";
    const el = n as HTMLElement;
    const tag = (el.rawTagName ?? "").toLowerCase();
    switch (tag) {
      case "img":
        return this.image(el);
      case "br":
        return "\n";
      case "sup":
        return this.script(el, SUPS, "^");
      case "sub":
        return this.script(el, SUBS, "_");
      case "table":
        return this.table(el);
      case "caption":
        return ""; // table() 이 처리한다
      case "script":
      case "style":
        return "";
      case "tr":
      case "td":
      case "th":
        // table 밖에 떨어진 조각
        return ` ${this.children(el)} `;
      default:
        return BLOCK.has(tag) ? `\n${this.children(el)}\n` : this.children(el);
    }
  }
}

export function htmlToMarkdown(html: string | null | undefined, images: ImageRef[] | null = null): string {
  if (!html) return "";
  const root = parse(html, { comment: false });
  const text = new Renderer(images).children(root);
  return text
    .split("\n")
    .map((ln) => (ln.startsWith("|") ? ln.trim() : ln.replace(/[ \t]+/g, " ").trim()))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function hasImage(html: string | null | undefined): boolean {
  return !!html && /<img/i.test(html);
}

// ── 문서 구조 ────────────────────────────────────────────────────────────────
// ★title 은 항목 자신의 제목이 아니라 **그 항목이 속한 조항의 제목**이다.
//   같은 조항의 문단·표가 모두 같은 title 을 반복해 갖는다. 그래서 절 범위는
//   level 트리를 타지 않고 title 앞머리의 조항번호로 고른다.
const CLAUSE_RE = /^\s*(\d+(?:\.\d+)*)\.?(?:\s|$)/;
const NUM_LABEL_RE = /^\d+(\.\d+)*\.?$/;

export function clauseNo(title: string | null | undefined): string {
  return CLAUSE_RE.exec(title ?? "")?.[1] ?? "";
}

export function isClauseHead(it: DocItem): boolean {
  return NUM_LABEL_RE.test((it.label ?? "").trim());
}

export function items(doc: KcscDocument): DocItem[] {
  return [...doc.list].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
}

export function outline(doc: KcscDocument, depth?: number): { no: string; title: string; depth: number }[] {
  const out: { no: string; title: string; depth: number }[] = [];
  for (const it of items(doc)) {
    if (!isClauseHead(it)) continue;
    const no = (it.label ?? "").trim().replace(/\.$/, "");
    const d = no.split(".").length;
    if (depth && d > depth) continue;
    out.push({ no, title: (it.title ?? "").trim(), depth: d });
  }
  return out;
}

export function sectionItems(doc: KcscDocument, section: string): DocItem[] {
  const sec = section.trim().replace(/\.$/, "");
  return items(doc).filter((it) => {
    const no = clauseNo(it.title);
    return !!no && (no === sec || no.startsWith(`${sec}.`));
  });
}

/** 항목들 → 마크다운. images 를 주면 수식 그림을 모으고 본문에 〔그림 N〕 번호를 단다. */
export function renderItems(its: DocItem[], images: ImageRef[] | null = null): { text: string; hasFormula: boolean } {
  const out: string[] = [];
  let hasFormula = false;
  let lastTitle: string | null = null;
  for (const it of its) {
    const label = (it.label ?? "").trim();
    const title = (it.title ?? "").trim();
    const html = it.contents ?? "";
    if (hasImage(html)) hasFormula = true;
    if (isClauseHead(it)) {
      const no = clauseNo(title) || label.replace(/\.$/, "");
      const level = Math.min(6, no.split(".").length + 1);
      out.push(`${"#".repeat(level)} ${title || label}`);
      lastTitle = title;
      // 조항 머리에도 본문이 붙어 오는 경우가 있다.
      const body = htmlToMarkdown(html, images);
      if (body && body !== title && body !== label) out.push(body);
      continue;
    }
    const body = htmlToMarkdown(html, images);
    if (!body) continue;
    if (lastTitle === null && title) {
      out.push(`**${title}**`);
      lastTitle = title;
    }
    if (label && label !== "본문" && !body.replace(/^\*+/, "").startsWith(label)) {
      out.push(body.length < 200 && !body.includes("\n") ? `**[${label}]** ${body}` : `**[${label}]**\n${body}`);
    } else {
      out.push(body);
    }
  }
  return { text: out.filter(Boolean).join("\n\n"), hasFormula };
}

/** 조항 단위로 묶은 본문 — 문서 안 키워드 검색용. */
export function clauses(doc: KcscDocument): { no: string; title: string; text: string }[] {
  const groups = new Map<string, { no: string; title: string; parts: string[] }>();
  for (const it of items(doc)) {
    const title = (it.title ?? "").trim();
    if (!title) continue;
    let g = groups.get(title);
    if (!g) {
      g = { no: clauseNo(title), title, parts: [] };
      groups.set(title, g);
    }
    if (!isClauseHead(it)) {
      const body = htmlToMarkdown(it.contents);
      if (body) g.parts.push(body);
    }
  }
  return [...groups.values()].map((g) => ({ no: g.no, title: g.title, text: g.parts.join("\n") }));
}

export function snippets(text: string, needle: string, limit = 3, width = 70): string[] {
  const out: string[] = [];
  const low = text.toLowerCase();
  const n = needle.toLowerCase();
  let start = 0;
  while (out.length < limit) {
    const i = low.indexOf(n, start);
    if (i < 0) break;
    const a = Math.max(0, i - width);
    const b = Math.min(text.length, i + needle.length + width);
    out.push((a > 0 ? "…" : "") + text.slice(a, b).split(/\s+/).join(" ") + (b < text.length ? "…" : ""));
    start = b;
  }
  return out;
}

// ── 출처 표기 ────────────────────────────────────────────────────────────────
/** 답변에 그대로 붙일 출처 태그. 기준은 시행일보다 판(연도)이 중요하므로 판을 함께 적는다. */
export function sourceTag(doc: { codeType: string; code: string; version?: string | null }): string {
  return `[${formatCode(doc.codeType, doc.code)} / ${doc.version ?? "판 미상"}판]`;
}

export function header(doc: KcscDocument): string {
  return [
    `# ${doc.name} (${formatCode(doc.codeType, doc.code)})`,
    `*${doc.version ?? "?"}판 · 개정일 ${String(doc.updateDate ?? "").slice(0, 10) || "?"} · 출처 국가건설기준센터(KCSC)*`,
    `원문: ${VIEWER_URL}/${doc.no}`,
  ].join("\n");
}

export const FORMULA_NOTICE =
  "⚠️ 이 범위에는 수식·기호 그림이 있습니다(〔그림 N〕). KCSC 원문에서 수식은 텍스트 없이 그림으로만 제공됩니다. " +
  "식을 기억으로 다시 쓰지 말고 kcsc_formula 로 원본 그림을 보거나 원문에서 확인하십시오.";

/** 상한을 넘으면 자르고, 잘렸다는 사실과 다음 행동을 남긴다. */
export function truncate(text: string, limit: number, hint = ""): string {
  if (limit <= 0 || text.length <= limit) return text;
  const head = text.slice(0, limit);
  const cut = head.includes("\n") ? head.slice(0, head.lastIndexOf("\n")) : head;
  return `${cut}\n\n---\n⚠️ 출력이 길어 여기서 잘랐습니다 (${text.length.toLocaleString()}자 중 ${cut.length.toLocaleString()}자). ${hint}`.trimEnd();
}
