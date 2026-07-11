// 가게 지식베이스 (여러 가게 지원: storeId로 구분)
// 새 가게를 추가하려면 이 객체에 항목을 추가하면 됩니다.

export const STORES = {
  S001: {
    name: "테스트네일",
    chunks: [
      { category: "가격", content: "젤네일은 5만원, 손케어는 3만원입니다." },
      { category: "영업시간", content: "평일 오전 10시부터 오후 8시까지 운영합니다." },
      { category: "휴무", content: "매주 일요일은 휴무입니다." },
      { category: "위치", content: "홍대에 위치하고 있습니다." },
      { category: "주차", content: "건물 지하 주차장에 2시간 동안 무료로 주차할 수 있습니다." },
      { category: "예약", content: "예약은 전화로만 가능합니다." },
    ],
  },
  // 예시) 가게 추가 시:
  // S002: { name: "앙기모띠 마사지샵", chunks: [ { category: "위치", content: "..." } ] },
};
