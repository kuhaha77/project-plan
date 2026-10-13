# korean-law-mcp (MIT, https://github.com/chrisryugj/korean-law-mcp) 를 npm 게시본으로 설치해 실행한다.
# 버전을 고정한다. 올릴 때는 아래 버전만 바꾸고 다시 배포한다(README 「업그레이드」 참고).
FROM node:22-alpine

ARG KOREAN_LAW_MCP_VERSION=4.15.7

# 선택 의존성(OCR·ML 헬퍼)과 postinstall 다운로더는 이 서버가 쓰지 않는다 — 원본 Dockerfile 과 같은 방침.
RUN npm install -g --omit=optional --ignore-scripts "korean-law-mcp@${KOREAN_LAW_MCP_VERSION}" \
 && npm cache clean --force

USER node
ENV NODE_ENV=production \
    PORT=3000 \
    MCP_HTTP_HOST=0.0.0.0
EXPOSE 3000

CMD ["korean-law-mcp", "--mode", "http", "--port", "3000"]
