// 카카오 챗봇 스킬 서버 (Vercel) - Gemini RAG + 콜백
//
// 동작:
//  1) 카카오가 이 함수를 호출 → 즉시 "준비 중" 콜백 응답을 5초 안에 반환
//  2) 백그라운드에서 RAG(임베딩 검색 + Gemini 답변 생성) 수행
//  3) 완성되면 카카오가 준 callbackUrl 로 진짜 답변 전송
//
// 환경변수(Vercel에 설정):
//  - GEMINI_API_KEY : Gemini API 키

import { STORES } from "./stores.js";

const GEN_MODEL = "gemini-3-flash-preview";
const EMB_MODEL = "gemini-embedding-001";
const EMB_DIM = 768;
const TOP_K = 4;

// 임베딩 캐시 (서버가 살아있는 동안 재사용)
const embedCache = {}; // { storeId: [{category, content, vec}] }

async function getEmbedding(text, taskType) {
  const key = process.env.GEMINI_API_KEY;
  const url =
    "https://generativelanguage.googleapis.com/v1beta/models/" +
    EMB_MODEL +
    ":embedContent?key=" +
    key;
  const body = {
    model: "models/" + EMB_MODEL,
    content: { parts: [{ text }] },
    taskType,
    outputDimensionality: EMB_DIM,
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (data.error) throw new Error("임베딩 오류: " + data.error.message);
  return data.embedding.values;
}

// 가게의 청크들을 임베딩(최초 1회만, 이후 캐시)
async function ensureStoreEmbedded(storeId) {
  if (embedCache[storeId]) return embedCache[storeId];
  const store = STORES[storeId];
  if (!store) return null;
  const out = [];
  for (const c of store.chunks) {
    const vec = await getEmbedding(c.category + ": " + c.content, "RETRIEVAL_DOCUMENT");
    out.push({ category: c.category, content: c.content, vec });
  }
  embedCache[storeId] = out;
  return out;
}

function cosine(a, b) {
  let d = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    d += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return d / (Math.sqrt(na) * Math.sqrt(nb) + 1e-10);
}

async function retrieve(storeId, question) {
  const items = await ensureStoreEmbedded(storeId);
  if (!items) return [];
  const qvec = await getEmbedding(question, "RETRIEVAL_QUERY");
  const scored = items.map((it) => ({
    category: it.category,
    content: it.content,
    score: cosine(qvec, it.vec),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, TOP_K);
}

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
      maxOutputTokens: 1024,
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
  const hits = await retrieve(storeId, question);
  if (!hits.length) {
    return "죄송해요, 아직 안내 정보가 준비되지 않았어요. 매장으로 직접 문의해 주세요!";
  }
  let info = "";
  for (const h of hits) info += "- [" + h.category + "] " + h.content + "\n";
  const sys =
    '너는 "' + storeName + '"의 친절한 안내 직원이다. ' +
    "반드시 아래 [가게 정보]에 있는 내용만으로 답해라. " +
    '정보에 없는 것은 지어내지 말고, "그 부분은 매장으로 전화 주시면 자세히 안내드릴게요"라고 답해라. ' +
    "손님에게 말하듯 짧고 친근하게, 2~3문장 이내로 답해라.";
  const usr = "[가게 정보]\n" + info + "\n[손님 질문]\n" + question;
  return await callGemini(sys, usr);
}

// 카카오로 보낼 simpleText 형식
function simpleText(text) {
  return { version: "2.0", template: { outputs: [{ simpleText: { text } }] } };
}

// 콜백 URL로 최종 답변 전송
async function sendCallback(callbackUrl, text) {
  await fetch(callbackUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(simpleText(text)),
  });
}

export default async function handler(req, res) {
  // 상태 확인용 (브라우저로 열면 보임)
  if (req.method === "GET") {
    res.status(200).send("카카오 스킬 서버 정상 작동 중!");
    return;
  }

  try {
    const body = req.body || {};
    const utterance =
      (body.userRequest && body.userRequest.utterance) || "";
    const callbackUrl =
      (body.userRequest && body.userRequest.callbackUrl) || null;
    // 스킬 주소의 ?store=Sxxx 로 가게 구분
    const storeId = (req.query && req.query.store) || "S001";

    if (callbackUrl) {
      // 1) 카카오에 즉시 "준비 중" 응답 (5초 제한 회피)
      res.status(200).json({
        version: "2.0",
        useCallback: true,
        data: { text: "답변을 준비하고 있어요. 잠시만요! 🙂" },
      });

      // 2) 백그라운드로 실제 답변 생성 후 콜백 전송
      //    (응답을 이미 보냈으므로 여기서 시간 걸려도 됨)
      try {
        const answer = await answerForStore(storeId, utterance);
        await sendCallback(callbackUrl, answer);
      } catch (e) {
        await sendCallback(callbackUrl, "죄송해요, 잠시 후 다시 시도해 주세요.");
      }
      return;
    }

    // 콜백을 안 쓰는 경우(빠른 답변용) - 동기 응답
    const answer = await answerForStore(storeId, utterance);
    res.status(200).json(simpleText(answer));
  } catch (err) {
    res.status(200).json(simpleText("오류가 발생했어요: " + err.message));
  }
}
