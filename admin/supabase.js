// 공개 페이지가 읽기 전용으로 사용하는 Supabase 클라이언트.
// config.js 가 비어 있으면 null 을 반환 — script.js 의 hydrate() 가 가드함.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cfg = window.APP_CONFIG || {};
export const sb = cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY
  ? createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;
