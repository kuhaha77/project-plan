/** KCSC OpenAPI 상수. 인증키는 코드에 두지 않고 Worker secret(KCSC_API_KEY)으로만 받는다. */

export const BASE_URL = "https://kcsc.re.kr/OpenApi";
export const VIEWER_URL = "https://www.kcsc.re.kr/StandardCode/Viewer";

/**
 * CodeList 에 실제로 들어 있는 기준 종류(2026-08 실측 9종).
 * 순서가 곧 우선순위다. 6자리 코드는 종류끼리 겹치므로(예: 143110 이 KDS·KCS·SMCS·EXCS·LHCS 5곳),
 * 종류를 지정하지 않으면 국가기준(KDS → KCS)을 먼저 고르고 나머지 후보를 반드시 알린다.
 */
export const CODE_TYPES = ["KDS", "KCS", "SMCS", "LHCS", "EXCS", "KRCCS", "KWCS", "NHCS", "KRACS"] as const;
export type CodeType = (typeof CODE_TYPES)[number];

export const CODE_TYPE_NAMES: Record<CodeType, string> = {
  KDS: "국가건설기준 설계기준",
  KCS: "국가건설기준 표준시방서",
  SMCS: "서울시 전문시방서",
  LHCS: "LH 전문시방서",
  EXCS: "한국도로공사 전문시방서",
  KRCCS: "국가철도공단 전문시방서",
  KWCS: "한국수자원공사 전문시방서",
  NHCS: "한국농어촌공사 전문시방서",
  KRACS: "한국공항공사 전문시방서",
};

export const FETCH_TIMEOUT_MS = 20_000;
/** 카탈로그는 하루, 본문은 버전이 같으면 7일 재사용한다. */
export const CATALOG_TTL_SEC = 24 * 3600;
export const DOC_TTL_SEC = 7 * 24 * 3600;
/** 한 번에 돌려줄 본문 기본 상한(글자). 넘으면 자르고 잘렸다고 알린다. */
export const DEFAULT_MAX_CHARS = 20_000;
