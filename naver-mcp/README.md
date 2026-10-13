# naver-mcp: 네이버 검색·데이터랩 원격 MCP 서버

PlayMCP의 NaverSearch를 대체하는 자체 호스팅 MCP 서버입니다. Cloudflare Workers에 배포한 뒤 claude.ai 커스텀 커넥터로 등록합니다. 네이버 오픈API(REST)를 직접 호출하므로 컨테이너가 필요 없습니다.

## 도구

| 도구 | 하는 일 | 비고 |
|---|---|---|
| `search_news` | 뉴스 검색 | 기본 **최신순**. 원문 링크와 매체 도메인을 함께 표시 |
| `search_blog` | 블로그 검색 | 기본 관련도순 |
| `search_cafearticle` | 카페글 검색 | 현장 반응 파악용 |
| `search_webkr` | 웹문서 검색 | |
| `datalab_search` | 검색어 트렌드(그룹 최대 5개, 그룹당 검색어 20개) | 최고점·최근값·평균, 최근 1/3 구간 대비 증감 배수 요약 |

도구 이름은 PlayMCP NaverSearch와 같게 맞췄습니다. 그래서 issue-scan·daily-news 등 스킬은 커넥터 이름 부분만 바꾸면 됩니다(아래 「스킬 수정」 참고).

**데이터랩 값의 의미**: 절대 검색량이 아니라 상대 지수입니다. 한 요청 안의 전체 그룹·기간 중 최고점이 100입니다. 서로 다른 요청끼리는 숫자를 비교할 수 없습니다. 도구 응답에도 이 경고를 매번 붙입니다.

## 배포 (약 10분)

### 0. 네이버 API 키 발급

1. <https://developers.naver.com> → Application → 애플리케이션 등록
2. 사용 API에 **검색**과 **데이터랩(검색어트렌드)** 을 모두 추가합니다. 하나라도 빠지면 그 도구만 403이 납니다.
3. 비로그인 오픈API 서비스 환경은 **WEB 설정**을 고르고, URL에는 아무 회사 도메인을 넣으면 됩니다(서버 호출에는 검사하지 않습니다).
4. 발급된 Client ID와 Client Secret을 보관합니다.

하루 한도는 앱당 검색 25,000회, 데이터랩 1,000회입니다. 팀 단위 사용에도 대개 충분합니다.

### 1~4. 설치·비밀값·배포

```bash
cd naver-mcp
npm install
npx wrangler login
npx wrangler secret put NAVER_CLIENT_ID
npx wrangler secret put NAVER_CLIENT_SECRET
openssl rand -hex 32                        # 접근 토큰 생성 → 복사
npx wrangler secret put MCP_ACCESS_TOKEN
npm run deploy                              # → https://naver-mcp.<계정>.workers.dev
```

무료 플랜으로도 동작합니다. 요청마다 하는 일이 API 호출 한 번과 텍스트 정리뿐이기 때문입니다.

### 5. claude.ai 커넥터 등록

설정 → 커넥터 → 커스텀 커넥터 추가:

- 이름: `naver-search`
- URL: `https://naver-mcp.<계정>.workers.dev/mcp/<MCP_ACCESS_TOKEN>`

URL에 토큰이 들어 있으므로 비밀번호처럼 다룹니다. Team/Enterprise 플랜은 Owner가 등록합니다.

Claude Code에서는 헤더를 쓸 수 있습니다.

```bash
claude mcp add --transport http naver https://naver-mcp.<계정>.workers.dev/mcp \
  --header "Authorization: Bearer <MCP_ACCESS_TOKEN>"
```

### 6. 확인

새 대화에서 커넥터를 켜고 "중대재해 최신 뉴스 5건", "중대재해·산업재해 검색량 최근 6개월 월별 비교"를 물어 봅니다.

## 스킬 수정

issue-scan `SKILL.md`의 도구 표기를 다음처럼 바꿉니다. 나머지 흐름은 그대로입니다.

| 기존 (PlayMCP) | 변경 |
|---|---|
| `NaverSearch-datalab_search` | `datalab_search` (naver-search 커넥터) |
| `NaverSearch-search_news` | `search_news` |
| `NaverSearch-search_blog` / `search_cafearticle` | `search_blog` / `search_cafearticle` |
| `tool_search`로 `NaverSearch datalab search trend` 확인 | `tool_search`로 `naver datalab_search` 확인 |

데이터랩 입력 형식은 `keyword_groups: [{group_name, keywords: [...]}]`, `start_date`·`end_date`(yyyy-mm-dd), `time_unit`(date·week·month)입니다.

## 개발

```bash
npm test            # 가짜 네이버 응답으로 도구·인증·오류 처리 검증
npm run typecheck
cp .dev.vars.example .dev.vars && npm run dev
```
