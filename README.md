# 카카오 챗봇 스킬 서버 (Vercel + Gemini RAG)

카카오톡 챗봇의 5초 응답 제한을, **콜백(즉시 응답 후 백그라운드 처리)** 방식으로 해결한 스킬 서버입니다.

## 동작 구조
1. 카카오가 `/api/skill` 호출
2. 서버가 즉시 "준비 중" 콜백 응답 반환 (5초 제한 회피)
3. 백그라운드에서 Gemini 임베딩 검색 + 답변 생성 (RAG)
4. 완성되면 카카오가 준 `callbackUrl`로 최종 답변 전송

## 배포 방법 (GitHub → Vercel)
1. 이 폴더를 GitHub 저장소에 올린다.
2. Vercel에서 `Add New → Project` → 그 저장소를 import.
3. **환경변수 추가**: `GEMINI_API_KEY` = (본인 Gemini 키)
4. Deploy.
5. 배포된 주소가 `https://<프로젝트>.vercel.app` 이면,
   카카오 스킬 URL은 **`https://<프로젝트>.vercel.app/api/skill?store=S001`**

## 가게 정보 수정
`api/stores.js`의 `STORES` 객체를 수정하면 된다. 새 가게는 `S002`, `S003`... 으로 추가.

## 상태 확인
브라우저로 `https://<프로젝트>.vercel.app/api/skill` 를 열면
"카카오 스킬 서버 정상 작동 중!"이 보인다.
