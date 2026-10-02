# kcsc-mcp: 설계기준·시방서 조회 원격 MCP 서버

국가건설기준센터(KCSC) OpenAPI를 감싼 MCP 서버입니다. Cloudflare Workers에 배포한 뒤 claude.ai **커스텀 커넥터**로 등록하면, 팀원 누구나 대화창에서 KDS(설계기준)·KCS(표준시방서) 원문을 조회할 수 있습니다.

## 도구

| 도구 | 하는 일 | 예 |
|---|---|---|
| `kcsc_search` | 기준 이름·상위 분류·코드로 찾기 | "거푸집", "KCS 철근", "14 20" |
| `kcsc_outline` | 판(연도)·개정일·조항 목차 | `KDS 14 20 10` |
| `kcsc_read` | 본문 읽기. `section`을 주면 그 절만 읽음. 표는 마크다운 표로 보존 | `KCS 14 20 12`, section `3.3` |
| `kcsc_find_in_document` | 기준 한 건 안에서 용어가 나오는 절과 문맥 | `KCS 14 20 12`에서 "존치기간" |
| `kcsc_formula` | 본문의 〔그림 N〕 자리에 있는 수식 원본 그림 | `kcsc_read`와 같은 code·section |

범위: KDS, KCS, 그리고 기관별 전문시방서(SMCS 서울시, LHCS LH, EXCS 도로공사, KRCCS 철도공단, KWCS 수자원공사, NHCS 농어촌공사, KRACS 공항공사). **표준품셈은 API가 없어 범위 밖입니다.**

## 설계상 지킨 것

- **출처 태그**: 모든 응답에 `[KDS 14 20 10 / 2024판]` 형식의 태그와 원문 링크를 붙입니다. 기준은 시행일보다 판(연도)이 중요하기 때문입니다.
- **수식을 지어내지 않음**: KCSC 원문의 수식은 텍스트 없는 GIF입니다. 본문에는 〔그림 N〕 자리표만 남기고 "기억으로 재구성 금지" 경고를 붙입니다. 원본 그림은 `kcsc_formula`로 볼 수 있습니다.
- **코드 충돌을 알림**: 6자리 코드는 종류끼리 겹칩니다(예: `142010`이 KDS·KCS·SMCS에 모두 있음). 종류를 지정하지 않으면 KDS → KCS 순으로 고르고, 무엇을 골랐는지와 다른 후보를 함께 알립니다.
- **틀린 인증키 감지**: KCSC는 키가 틀려도 HTTP 200에 빈 레코드를 돌려줍니다. 서버가 이를 오류로 바꿔, 빈 카탈로그가 캐시에 남지 않게 합니다.
- **인증키 비노출**: KCSC 키는 Worker secret에만 저장합니다. 커넥터 사용자에게는 별도의 접근 토큰만 줍니다.

## 배포 (약 10분)

### 0. 준비

- KCSC OpenAPI 인증키: <https://www.kcsc.re.kr>에 회원가입한 뒤 OpenAPI를 신청합니다.
- Cloudflare 계정. Workers **Paid 플랜($5/월)을 권장**합니다. 카탈로그(약 3,500건)와 큰 기준 본문을 파싱하는 데 무료 플랜의 CPU 한도(요청당 10ms)가 빠듯할 수 있습니다.

### 1. 설치 및 로그인

```bash
cd kcsc-mcp
npm install
npx wrangler login
```

### 2. 비밀값 등록

```bash
npx wrangler secret put KCSC_API_KEY        # 발급받은 KCSC 인증키
openssl rand -hex 32                         # 접근 토큰 생성 → 복사
npx wrangler secret put MCP_ACCESS_TOKEN    # 위에서 만든 값
```

### 3. (권장) 캐시용 KV

```bash
npx wrangler kv namespace create KCSC_CACHE
```

출력된 `id`를 `wrangler.jsonc`의 `kv_namespaces` 주석을 풀어 넣습니다. KV가 없어도 동작은 하지만, 그 경우 요청이 새 isolate로 갈 때마다 카탈로그를 다시 받습니다.

### 4. 배포

```bash
npm run deploy
# → https://kcsc-mcp.<계정>.workers.dev
```

### 5. claude.ai 커넥터 등록

설정 → 커넥터 → **커스텀 커넥터 추가**에서 다음 URL을 넣습니다.

```
https://kcsc-mcp.<계정>.workers.dev/mcp/<MCP_ACCESS_TOKEN>
```

Team/Enterprise 플랜이라면 조직 관리자가 한 번 등록해 팀원에게 배포할 수 있습니다. 토큰이 URL에 들어 있으므로 **URL 자체를 비밀번호처럼 다루세요.** 유출되면 `wrangler secret put MCP_ACCESS_TOKEN`으로 토큰을 바꾸고 커넥터를 다시 등록하면 됩니다.

Claude Code에서는 헤더를 쓸 수 있습니다.

```bash
claude mcp add --transport http kcsc https://kcsc-mcp.<계정>.workers.dev/mcp \
  --header "Authorization: Bearer <MCP_ACCESS_TOKEN>"
```

### 6. 확인

```bash
curl https://kcsc-mcp.<계정>.workers.dev/health
```

대화창에서 "KCS 14 20 12 거푸집 해체 시기 3.3절 보여줘"처럼 물어 봅니다.

## 개발

```bash
npm test           # 단위 + Worker 왕복 테스트(가짜 KCSC 응답)
npm run typecheck
cp .dev.vars.example .dev.vars && npm run dev   # 로컬 실행: http://127.0.0.1:8787/mcp/<토큰>
```

## law-scan 스킬과 연결

커넥터를 등록한 뒤 law-scan `SKILL.md`에 다음 블록을 추가하면, 법령 질의와 기준 질의가 한 흐름으로 이어집니다.

```markdown
## 건설기준(KDS·KCS) 조회 — kcsc 커넥터
- 라우팅: 질의에 'KDS', 'KCS', '설계기준', '시방서', '표준시방', '○○ 기준 몇 절'이 있으면
  kcsc_search → kcsc_outline → kcsc_read(section) 순으로 조회한다.
- 출처 태그: 도구가 준 [KDS xx xx xx / 연도판] 태그와 절 번호를 그대로 쓴다. [법령]·[판례] 태그와 나란히 둔다.
- 수식: 〔그림 N〕이 있으면 식을 텍스트로 재구성하지 않는다. 필요하면 kcsc_formula로 그림을 보고,
  답변에 "수식 원문 확인 필요"를 붙인다.
- 법령→기준 연결: 법령상 의무(예: 건설기술진흥법상 품질·안전관리)를 먼저 답하고,
  그 의무를 구체화하는 KDS/KCS 조항을 이어서 제시한다.
- 품셈: API가 없으므로 조회하지 않고 "표준품셈 PDF 원문 확인"으로 안내한다.
```

## 참고

API 동작과 함정(null 레코드, 코드 충돌, `title` 필드 구조, 수식 그림)은 MIT 라이선스로 공개된 [kcsc-design-mcp](https://github.com/lhs1152-lgtm/kcsc-design-mcp)의 실측 문서(`docs/KCSC_API.md`, 2026-08)를 참고했습니다. 기준 원문 데이터는 이 저장소에 넣지 않습니다. 모든 내용은 실행할 때 KCSC에서 받아 옵니다.
