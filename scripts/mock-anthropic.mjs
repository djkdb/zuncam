// 로컬 개발/발표 리허설용 Anthropic Messages API 목 서버.
// 사용: MODE=ok|badjson|slow node scripts/mock-anthropic.mjs  →  ANTHROPIC_API_KEY=test ANTHROPIC_BASE_URL=http://localhost:4010 npm run dev
// ok 모드는 검증 로직 확인을 위해 의도적으로 환각 시각(16:20, 17:50)과 존재하지 않는 id 를 섞어 반환한다.
import http from "node:http";
const MODE = process.env.MODE || "ok"; // ok | badjson | slow
const reply = (text) => ({ id: "msg_mock", type: "message", role: "assistant", model: "mock-model", content: [{ type: "text", text }], stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } });
http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", async () => {
    const j = JSON.parse(body || "{}");
    const sys = String(j.system || "");
    const input = JSON.parse(String(j.messages?.[0]?.content || "").replace(/^입력\(JSON\):\n/, "") || "{}");
    let out;
    if (sys.includes("브리핑 엔진")) {
      out = { summary: "오늘은 자료구조 과제 마감이 가장 급합니다. 풋살 전에 한 번 집중하세요.",
        recommendation: "16:20부터 17:50까지 자료구조 과제를 하세요.", // 환각된 시각
        priorityReasons: input.priorities.map((p) => ({ id: p.id, reason: `[AI] ${p.title}: ${p.facts[0]}` })).concat([{ id: "assignment:ghost", reason: "없는 항목" }]),
        planNotes: [], warnings: ["17:20에는 풋살장으로 출발해야 합니다."] };
    } else if (sys.includes("지금 뭐 하지")) {
      out = { message: `지금은 ${input.now.targetTitle}을 시작하세요. ${input.now.nextStop?.at ?? ""}에 출발해야 하니 ${input.now.focusMinutes}분 집중할 수 있어요.`, tips: ["휴대폰 알림을 17:20에 맞춰두세요."] };
    } else if (sys.includes("구조화하는 파서")) {
      out = { kind: "event", title: "풋살", subject: "", dateType: "weekday", weekday: 5, weekOffset: 0, relativeDays: null, month: null, day: null, startTime: "18:00", endTime: "20:00", dueTime: null, estimatedMinutes: null, importance: null, category: "exercise", location: null, timeAmbiguous: true };
    } else {
      out = { advice: input.conflicts.map((c) => ({ conflictId: c.id, explanation: `${c.a.title}(${c.a.start}~${c.a.end})와 ${c.b.title}이 겹칩니다.`, suggestion: `${c.b.title}을 ${c.a.end} 이후로 옮기세요.` })) };
    }
    if (MODE === "slow") await new Promise((r) => setTimeout(r, 40000));
    const text = MODE === "badjson" ? '{"summary": "잘린 응답' : JSON.stringify(out);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(reply(text)));
  });
}).listen(4010, () => console.log("mock on 4010", MODE));
