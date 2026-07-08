import { readFile } from "node:fs/promises";

// tools/ 의 빌드타임 fetch 스크립트가 공유하는 헬퍼.
// (fetch-youtube-videos.mjs, fetch-instagram-posts.mjs 공용)

export async function fetchJson(url, { accept = "application/json" } = {}) {
  const res = await fetch(url, { headers: { Accept: accept } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body?.error?.message || `Request failed: ${res.status} ${res.statusText}`);
  }
  return body;
}

export async function readExisting(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

export function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(number)));
}
