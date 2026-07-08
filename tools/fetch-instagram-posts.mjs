import { mkdir, writeFile, readdir, rm, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchJson, readExisting, clean, clampNumber } from "./_lib.mjs";

// Instagram 게시물을 빌드타임에 가져와 정적 JSON + 이미지로 굽는다.
// - 토큰은 GitHub Secret(INSTAGRAM_ACCESS_TOKEN)으로만 주입한다. 브라우저에는 절대 노출 X.
// - 2024-12 폐기된 Basic Display API 가 아니라 graph.instagram.com (Instagram API with Instagram Login) 사용.
// - 실패하거나 토큰이 없으면 기존 산출물을 그대로 두고 종료 → 사이트가 깨지지 않음.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const token = String(process.env.INSTAGRAM_ACCESS_TOKEN || "").trim();
const graphVersion = String(process.env.INSTAGRAM_GRAPH_VERSION || "v21.0").trim();
const postLimit = clampNumber(process.env.INSTAGRAM_POST_LIMIT, 1, 24, 6);
const outputPath = path.resolve(root, process.env.INSTAGRAM_OUTPUT || "assets/instagram-posts.json");
const mediaDir = path.resolve(root, process.env.INSTAGRAM_MEDIA_DIR || "assets/instagram");
const mediaRelBase = path.relative(root, mediaDir).split(path.sep).join("/");
const refreshMode = process.argv.includes("--refresh-token");

if (refreshMode) {
  await refreshToken();
  process.exit(0);
}

if (!token) {
  console.warn("[instagram] INSTAGRAM_ACCESS_TOKEN 미설정 — 기존 산출물을 유지하고 종료합니다.");
  process.exit(0);
}

let media;
try {
  media = await fetchMedia();
} catch (error) {
  console.warn(`[instagram] API 호출 실패: ${error.message}`);
  const existing = await readExisting(outputPath);
  if (existing?.posts?.length) console.warn(`[instagram] 기존 ${path.relative(root, outputPath)} 를 유지합니다.`);
  process.exit(0);
}

if (!media.length) {
  console.warn("[instagram] 공개 게시물이 없습니다 — 기존 산출물을 유지하고 종료합니다.");
  process.exit(0);
}

await mkdir(mediaDir, { recursive: true });

// 이미지 URL 이 있는 게시물만 후보로 추린다.
// VIDEO/REELS 는 thumbnail_url, 그 외(IMAGE·CAROUSEL_ALBUM)는 media_url — 없으면 thumbnail_url 로 폴백.
const candidates = media
  .map((item) => {
    const imageUrl = item.media_type === "VIDEO" ? item.thumbnail_url : item.media_url || item.thumbnail_url;
    return imageUrl ? { item, imageUrl, fileName: `${sanitizeId(item.id)}.jpg` } : null;
  })
  .filter(Boolean);

// 다운로드는 병렬로. 이미 받아둔 파일은 다시 받지 않아 git 히스토리 증식과 시간을 줄인다.
const downloaded = await Promise.all(
  candidates.map(async ({ item, imageUrl, fileName }) => {
    const filePath = path.join(mediaDir, fileName);
    try {
      if (!(await fileExists(filePath))) await downloadImage(imageUrl, filePath);
    } catch (error) {
      console.warn(`[instagram] 이미지 다운로드 실패(${item.id}): ${error.message}`);
      return null;
    }
    return {
      fileName,
      post: {
        id: item.id,
        permalink: clean(item.permalink) || "https://www.instagram.com/backline_stage_official/",
        caption: clean(item.caption).slice(0, 140),
        mediaType: clean(item.media_type) || "IMAGE",
        image: `./${mediaRelBase}/${fileName}`,
        timestamp: clean(item.timestamp),
      },
    };
  }),
);

const kept = downloaded.filter(Boolean);

if (!kept.length) {
  console.warn("[instagram] 다운로드된 이미지가 없습니다 — 기존 산출물을 유지합니다.");
  process.exit(0);
}

await pruneMediaDir(new Set(kept.map((entry) => entry.fileName)));

const payload = {
  provider: "instagram-graph-api",
  updatedAt: new Date().toISOString(),
  posts: kept.map((entry) => entry.post),
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(`[instagram] ${payload.posts.length}개 게시물을 ${path.relative(root, outputPath)} 에 기록했습니다.`);

async function fetchMedia() {
  const url = new URL(`https://graph.instagram.com/${graphVersion}/me/media`);
  url.searchParams.set("fields", "id,caption,media_type,media_url,permalink,thumbnail_url,timestamp");
  url.searchParams.set("limit", String(postLimit));
  url.searchParams.set("access_token", token);

  const data = await fetchJson(url);
  return Array.isArray(data.data) ? data.data : [];
}

async function refreshToken() {
  if (!token) {
    console.warn("[instagram] 갱신할 토큰이 없습니다.");
    return;
  }

  const url = new URL("https://graph.instagram.com/refresh_access_token");
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", token);

  try {
    const data = await fetchJson(url);
    const next = clean(data.access_token);
    if (!next) {
      console.warn("[instagram] 갱신 응답에 access_token 이 없습니다.");
      return;
    }
    // 새 토큰이 로그에 남지 않도록 러너에 마스킹 지시.
    console.log(`::add-mask::${next}`);
    const outFile = process.env.GITHUB_OUTPUT;
    if (outFile) await writeFile(outFile, `token=${next}\nexpires_in=${data.expires_in || ""}\n`, { flag: "a" });
    console.log(`[instagram] 토큰 갱신 성공 (약 ${Math.round((data.expires_in || 0) / 86400)}일 유효).`);
  } catch (error) {
    console.warn(`[instagram] 토큰 갱신 실패: ${error.message}`);
  }
}

async function downloadImage(imageUrl, filePath) {
  const res = await fetch(imageUrl, { redirect: "follow" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  if (!buffer.length) throw new Error("빈 응답");
  await writeFile(filePath, buffer);
}

async function pruneMediaDir(keepFiles) {
  let entries;
  try {
    entries = await readdir(mediaDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(".jpg") && !keepFiles.has(entry.name)) {
      await rm(path.join(mediaDir, entry.name), { force: true });
    }
  }
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function sanitizeId(value) {
  return String(value || "").replace(/[^A-Za-z0-9_-]/g, "") || "post";
}
