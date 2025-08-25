// server/services/sseService.js

// SSE 연결 클라이언트를 관리하는 배열
let sseClients = [];

/**
 * SSE 라우트 핸들러를 Express 라우터에 등록
 * @param {object} router - Express 라우터 객체
 */
const initializeSse = (router) => {
  router.get("/progress-sse", (req, res) => {
    // SSE 응답에 필요한 헤더 설정
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    // 새로운 클라이언트를 목록에 추가
    sseClients.push(res);
    console.log(`[SSE] 클라이언트 연결. 현재 연결 수: ${sseClients.length}`);

    // 클라이언트 연결이 끊어졌을 때 목록에서 제거
    req.on("close", () => {
      sseClients = sseClients.filter(client => client !== res);
      console.log(`[SSE] 클라이언트 연결 종료. 현재 연결 수: ${sseClients.length}`);
    });
  });
};

/**
 * 연결된 모든 SSE 클라이언트에게 진행 상황 업데이트를 브로드캐스트
 * @param {object} progressState - 클라이언트에게 전송할 상태 객체
 */
const broadcastProgressUpdate = (progressState) => {
  if (sseClients.length === 0) return;

  const data = JSON.stringify(progressState);
  // console.log(`[SSE] 브로드캐스팅: ${data}`);
  sseClients.forEach(client => client.write(`data: ${data}\n\n`));
};

module.exports = {
  initializeSse,
  broadcastProgressUpdate,
};