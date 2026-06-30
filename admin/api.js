// 관리자 fetch 클라이언트
// - 모든 쓰기 작업은 /api/admin/* (Cloudflare Pages Functions) 를 거침
// - Cloudflare Access가 사전 인증을 처리하므로 별도 토큰 불필요
// - Pages Function이 service_role 키로 Supabase 호출

// 관리자 fetch 클라이언트
//   - 모든 쓰기 작업은 /api/admin/* (Cloudflare Pages Functions) 를 거침
//   - Cloudflare Access 가 사전 인증을 처리하므로 별도 토큰 불필요
//   - 401/403 이 오면 페이지를 reload — CF Access 가 자동으로 로그인 플로우로 보냄

function handleAuth(status) {
  if (status === 401 || status === 403) {
    window.location.reload();
    throw new Error("unauthorized");
  }
}

async function api(path, init = {}) {
  const hasBody = init.method && init.method !== "GET" && init.body;
  const res = await fetch("/api/admin/" + path, {
    credentials: "include",
    ...init,
    headers: {
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      ...(init.headers || {}),
    },
  });
  handleAuth(res.status);
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error((data && data.error) || res.statusText);
  return data;
}

async function apiForm(path, formData, method = "POST") {
  const res = await fetch("/api/admin/" + path, {
    method,
    credentials: "include",
    body: formData, // multipart — Content-Type 자동 설정
  });
  handleAuth(res.status);
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error((data && data.error) || res.statusText);
  return data;
}

export const Admin = {
  listNotices:   ()      => api("notices"),
  createNotice:  (body)  => api("notices", { method: "POST", body: JSON.stringify(body) }),
  updateNotice:  (id, body) => api("notices/" + id, { method: "PUT", body: JSON.stringify(body) }),
  deleteNotice:  (id)    => api("notices/" + id, { method: "DELETE" }),

  listPosters:   ()      => api("posters"),
  uploadPoster:  (fd)    => apiForm("posters", fd),
  updatePoster:  (id, fd) => apiForm("posters/" + id, fd, "PUT"),
  deletePoster:  (id)    => api("posters/" + id, { method: "DELETE" }),

  getVenue:      ()      => api("venue"),
  saveVenue:     (body)  => api("venue", { method: "PUT", body: JSON.stringify(body) }),
  getSettings:   ()      => api("settings"),
  saveSettings:  (patch) => api("settings", { method: "PUT", body: JSON.stringify(patch) }),
};
