/**
 * Cloudflare Worker 진입점 — korean-law-mcp 컨테이너 앞단.
 *
 *   POST /mcp/<MCP_ACCESS_TOKEN>        ← claude.ai 커스텀 커넥터에 이 URL 을 등록
 *   POST /mcp  + Authorization: Bearer <MCP_ACCESS_TOKEN>   ← Claude Code 등
 *
 * 법제처 OC(LAW_OC)는 Worker secret 에만 있고 사용자 URL 에는 들어가지 않는다.
 */
import { Container, getContainer } from "@cloudflare/containers";
import type { DurableObject } from "cloudflare:workers";
import { handle, type ProxyEnv } from "./proxy";

export interface Env extends ProxyEnv {
  LAW_CONTAINER: DurableObjectNamespace<LawContainer>;
}

export class LawContainer extends Container<Env> {
  defaultPort = 3000;
  // 마지막 요청 후 이 시간이 지나면 잠든다. 다음 요청 때 수 초의 기동 지연이 생긴다.
  sleepAfter = "15m";

  constructor(ctx: DurableObject["ctx"], env: Env) {
    super(ctx, env);
    this.envVars = {
      // 컨테이너는 이 토큰이 x-mcp-token 헤더로 와야만 요청을 받는다. 앞단 Worker 만 안다.
      MCP_AUTH_TOKEN: env.MCP_ACCESS_TOKEN ?? "",
      // 요청마다 apikey 헤더로도 넣지만, 서버 기본값으로도 둔다.
      LAW_OC: env.LAW_OC ?? "",
      // 모든 요청이 이 Worker 한 곳에서 오므로 IP 기준 제한은 사실상 전체 제한이 된다. 넉넉히 둔다.
      RATE_LIMIT_RPM: "600",
      // OC 를 URL 쿼리로 받는 경로는 닫는다(앞단이 헤더로만 넣는다).
      ALLOW_QUERY_API_KEY: "0",
    };
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    // 인스턴스 하나를 이름으로 고정해 쓴다. 조회 전용 무상태 서버라 이것으로 충분하다.
    return handle(req, env, (r) => getContainer(env.LAW_CONTAINER, "law").fetch(r));
  },
} satisfies ExportedHandler<Env>;
