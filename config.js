// ─────────────────────────────────────────────────────────────────
// Supabase 연결 설정 — 운영 시 아래 두 값만 채우면 모든 페이지가 자동 동기화됩니다.
//
//   1. https://supabase.com → New project 생성
//   2. db/schema.sql 을 SQL Editor 에 붙여넣고 RUN
//   3. Project Settings → API 에서 Project URL 과 anon public 키 복사
//   4. 아래 두 값에 붙여넣고 저장
//
// 두 값이 비어 있으면 사이트는 "정적 시안 모드"로 작동합니다 (HTML에 적힌 placeholder 그대로).
// 채워지면 공개 페이지는 DB에서 fetch, 관리자 페이지는 로그인 후 CRUD 가능.
// ─────────────────────────────────────────────────────────────────

window.APP_CONFIG = {
  SUPABASE_URL: "",        // 예: "https://abcdxyz.supabase.co"
  SUPABASE_ANON_KEY: "",   // 예: "eyJhbGciOi..." (anon/public 키)
};

window.APP_CONFIG.READY = !!(
  window.APP_CONFIG.SUPABASE_URL && window.APP_CONFIG.SUPABASE_ANON_KEY
);
