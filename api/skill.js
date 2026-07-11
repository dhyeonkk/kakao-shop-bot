// 카카오 챗봇 스킬 서버 (Vercel) - Gemini + 콜백 (waitUntil)
//
// 핵심: 카카오에 "준비 중" ack를 즉시 보내고(타임아웃 방지),
//       waitUntil로 백그라운드에서 답변 생성 후 콜백 전송.
//       (waitUntil이 응답 후에도 함수를 살려둠 → 서버리스 조기종료 방지)
//
// 환경변수(Vercel): GEMINI_API_KEY

import { waitUntil } from "@vercel/functions";
import { STORES } from "./stores.js";

const GEN_MODEL = "gemini-3-flash-preview";

async function callGemini(systemText, userText) {
  const key = process.env.GEMINI_API_KEY;
  const url =
    "https://generativelanguage.googleapis.com/v1beta/models/" +
    GEN_MODEL +
    ":generateContent?key=" +
    key;
  const body = {
    systemInstruction: { parts: [{ text: systemText }] },
    contents: [{ role: "user", parts: [{ text: userText }] }],
    generationConfig: {
      maxOutputTokens: 512,
      temperature: 0.4,
      thinkingConfig: { thinkingLevel: "minimal" },
    },
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (data.error) throw new Error("Gemini 오류: " + data.error.message);
  if (!data.candidates || !data.candidates.length) throw new Error("응답이 비어 있습니다.");
  return data.candidates[0].content.parts[0].text.trim();
}

async function answerForStore(storeId, question) {
  const store = STORES[storeId];
  const storeName = store ? store.name : "저희 가게";
  if (!store) {
    return "죄송해요, 아직 안내 정보가 준비되지 않았어요. 매장으로 직접 문의해 주세요!";
  }
  let info = "";
  for (const c of store.chunks) info += "- [" + c.category + "] " + c.content + "\n";

  const sys =
    '너는 "' + storeName + '"의 친절한 안내 직원이다. ' +
    "반드시 아래 [가게 정보]에 있는 내용만으로 답해라. " +
    '정보에 없는 것은 지어내지 말고, "그 부분은 매장으로 전화 주시면 자세히 안내드릴게요"라고 답해라. ' +
    "손님에게 말하듯 짧고 친근하게, 2~3문장 이내로 답해라.";
  const usr = "[가게 정보]\n" + info + "\n[손님 질문]\n" + question;
  return await callGemini(sys, usr);
}

function simpleText(text) {
  return { version: "2.0", template: { outputs: [{ simpleText: { text } }] } };
}

async function sendCallback(callbackUrl, text) {
  await fetch(callbackUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(simpleText(text)),
  });
}

// 백그라운드 작업: 답변 생성 후 콜백 전송
async function processInBackground(callbackUrl, storeId, utterance) {
  try {
    const answer = await answerForStore(storeId, utterance);
    await sendCallback(callbackUrl, answer);
  } catch (e) {
    try { await sendCallback(callbackUrl, "죄송해요, 잠시 후 다시 시도해 주세요."); } catch (e2) {}
  }
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    res.status(200).send("카카오 스킬 서버 정상 작동 중!");
    return;
  }

  try {
    const body = req.body || {};
    const utterance = (body.userRequest && body.userRequest.utterance) || "";
    const callbackUrl = (body.userRequest && body.userRequest.callbackUrl) || null;
    const storeId = (req.query && req.query.store) || "S001";

    if (callbackUrl) {
      // 1) 백그라운드 작업 예약 (응답 후에도 waitUntil이 함수를 살려둠)
      waitUntil(processInBackground(callbackUrl, storeId, utterance));
      // 2) 카카오에 즉시 ack 응답 → 타임아웃 방지
      res.status(200).json({
        version: "2.0",
        useCallback: true,
        data: { text: "답변을 준비하고 있어요. 잠시만요! 🙂" },
      });
      return;
    }

    // 콜백 미사용(빠른 응답)
    const answer = await answerForStore(storeId, utterance);
    res.status(200).json(simpleText(answer));
  } catch (err) {
    res.status(200).json(simpleText("오류가 발생했어요: " + err.message));
  }
}
