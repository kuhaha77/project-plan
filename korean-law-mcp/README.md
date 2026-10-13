# korean-law-mcp 자체 호스팅 (Cloudflare Workers + Containers)

PlayMCP의 `koreanlawmcp466` 도구를 대체합니다. 그 도구의 원본인 오픈소스 [korean-law-mcp](https://github.com/chrisryugj/korean-law-mcp)(MIT, chrisryugj)를 그대로 컨테이너로 띄우고, 앞단에 claude.ai 커넥터용 인증 Worker를 둡니다.

새로 짜지 않고 원본을 호스팅하는 이유는 세 가지입니다.

- **도구가 PlayMCP와 똑같습니다.** `search_law`, `get_law_text`, `get_annexes`, `search_decisions`(18개 도메인), `get_decision_text`, `legal_research`, `legal_analysis`, `ordinance_radar`, `discover_tools`, `execute_tool` 10개를 그대로 제공합니다(4.15.7로 실측 확인). law-scan 스킬은 도구 이름을 고칠 필요가 없습니다.
- **법제처 API의 함정이 이미 처리돼 있습니다.** 클라우드 IP에 오는 JS 안티봇 페이지 우회, 2026-08 eflaw 변경 대응, 빈 본문 재시도 등이 들어 있습니다. 직접 짜면 이걸 다시 겪어야 합니다.
- **원본이 활발히 관리됩니다.** 버전만 올려 재배포하면 됩니다.

## 구조

```
claude.ai ──/mcp/<접근토큰>──▶ Worker(인증·헤더 변환) ──x-mcp-token + apikey(OC)──▶ 컨테이너(korean-law-mcp)
```

- claude.ai 커스텀 커넥터는 헤더를 못 싣습니다. 원본 서버는 헤더 인증만 받으므로, Worker가 URL 토큰을 확인한 뒤 헤더로 바꿔 넘깁니다.
- 법제처 OC는 Worker secret에만 있습니다. 사용자 URL에 OC가 들어가지 않으므로, 공개 서버(`mcp.gomdori.app/law?oc=...`)처럼 제3자가 OC를 볼 일이 없습니다.
- 컨테이너는 15분 동안 요청이 없으면 잠듭니다. 깨어날 때 첫 요청이 몇 초 늦을 수 있습니다.

## 배포 (약 20분)

### 0. 준비

- **법제처 OC**: <https://open.law.go.kr>에서 Open API를 신청합니다. OC는 가입 이메일의 @ 앞부분입니다. PlayMCP에 쓰던 값이 있으면 그대로 씁니다.
- **Cloudflare Workers Paid 플랜($5/월)**: Containers는 유료 플랜에서만 됩니다.
- **Docker Desktop**: 배포할 때 wrangler가 로컬에서 이미지를 빌드해 올립니다. 배포하는 PC에서 Docker가 실행 중이어야 합니다.

### 1. 설치·비밀값

```bash
cd korean-law-mcp
npm install
npx wrangler login
npx wrangler secret put LAW_OC              # 법제처 OC
openssl rand -hex 32                        # 접근 토큰 생성 → 복사
npx wrangler secret put MCP_ACCESS_TOKEN
```

### 2. 배포

```bash
npm run deploy                              # 이미지 빌드·업로드 포함, 처음엔 수 분 걸림
# → https://korean-law-mcp.<계정>.workers.dev
```

배포 직후 컨테이너가 준비되기까지 몇 분 걸릴 수 있습니다. `npx wrangler containers list`로 상태를 봅니다.

### 3. claude.ai 커넥터 교체

1. 설정 → 커넥터에서 기존 PlayMCP 법령 도구를 끕니다.
2. 커스텀 커넥터를 추가합니다.
   - 이름: `korean-law`
   - URL: `https://korean-law-mcp.<계정>.workers.dev/mcp/<MCP_ACCESS_TOKEN>`
3. 새 대화에서 korean-law를 켜고 `/law-scan 산업안전보건법 제38조`를 실행합니다. `search_law` → `get_law_text`가 성공하면 끝입니다.

Claude Code에서는 다음처럼 등록합니다.

```bash
claude mcp add --transport http korean-law https://korean-law-mcp.<계정>.workers.dev/mcp \
  --header "Authorization: Bearer <MCP_ACCESS_TOKEN>"
```

## 문제가 생기면

| 증상 | 원인과 조치 |
|---|---|
| 배포 중 `SELF_SIGNED_CERT_IN_CHAIN` | 회사망의 SSL 검사 장비가 Docker 빌드의 npm 접속을 가로챈 경우입니다. 사외망(테더링 등)에서 배포하거나, IT에 registry.npmjs.org 예외를 요청합니다. |
| 도구 응답에 "사용자 정보 검증에 실패" | open.law.go.kr 신청 정보의 IP·도메인 제한일 수 있습니다. 신청 내역에서 제한을 풀거나 Workers 도메인을 등록합니다. |
| 도구 응답에 `EXTERNAL_API_ERROR`가 계속 남 | 법제처가 Cloudflare 출구 IP를 막는 경우입니다. 원본에 안티봇 우회가 있지만 막히면 같은 Dockerfile로 Fly.io(도쿄 리전)에 올리는 것이 대안입니다. |
| 첫 호출만 느리거나 타임아웃 | 컨테이너가 잠들었다 깨는 중입니다. 한 번 더 호출하면 됩니다. 잦으면 `src/index.ts`의 `sleepAfter`를 늘립니다. |
| 401 | URL의 토큰이 `MCP_ACCESS_TOKEN`과 다릅니다. |
| 503 | `LAW_OC` 또는 `MCP_ACCESS_TOKEN` secret이 빠졌습니다. |

## 업그레이드

`Dockerfile`의 `KOREAN_LAW_MCP_VERSION`을 올리고 `npm run deploy`를 실행합니다. 변경 내역은 원본 저장소의 CHANGELOG에서 확인합니다. 도구 이름이나 입력 형식이 바뀌면 law-scan 스킬도 함께 고칩니다.

## 개발·검증

```bash
npm test                     # 앞단 Worker 단위 테스트
# 실제 서버와 왕복 확인:
#   npx korean-law-mcp@4.15.7 를 MCP_AUTH_TOKEN=secret-token MCP_HTTP_HOST=0.0.0.0 로 --mode http --port 3000 실행 후
LAW_UPSTREAM_URL=http://127.0.0.1:3000 npm test
```

## 라이선스

korean-law-mcp는 MIT 라이선스입니다(Copyright (c) 2025 Chris). 이 폴더는 npm 게시본을 설치해 실행할 뿐 소스를 수정하지 않습니다.
