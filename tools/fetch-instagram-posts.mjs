import { mkdir, writeFile, readdir, rm, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchJson, readExisting, clean, clampNumber } from "./_lib.mjs";

// Instagram 게시물을 빌드타임에 가져와 정적 JSON + 이미지로 굽는다.
// - 토큰은 GitHub Secret(INSTAGRAM_ACCESS_TOKEN)으로만 주입한다. 브라우저에는 절대 노출 X.
// - 두 가지 토큰을 지원한다:
//   1) IGAA…  (Instagram API with Instagram Login) → graph.instagram.com/me/media
//   2) EAA…   (Facebook 그래프 / 시스템 유저 토큰, 만료 없음) → graph.facebook.com 에서
//      페이지 → instagram_business_account 를 찾아 /{ig-user-id}/media 호출.
//      시스템 유저에 페이지·인스타 자산이 할당돼 있어야 하며, INSTAGRAM_IG_USER_ID 로 IG 계정 ID(17841…)를
//      직접 지정하면 탐색 없이 바로 그 계정을 조회한다.
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

// updatedAt 만 바뀐 경우 파일을 다시 쓰지 않는다 — 크론마다 커밋이 생기면
// Netlify 빌드(크레딧)가 낭비된다. 실제 게시물이 바뀔 때만 커밋된다.
const previous = await readExisting(outputPath);
if (previous && JSON.stringify(previous.posts) === JSON.stringify(payload.posts)) {
  console.log(`[instagram] 게시물 변경 없음 — ${path.relative(root, outputPath)} 를 그대로 둡니다.`);
  process.exit(0);
}

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(`[instagram] ${payload.posts.length}개 게시물을 ${path.relative(root, outputPath)} 에 기록했습니다.`);

async function fetchMedia() {
  const isFacebookToken = token.startsWith("EAA");
  const host = isFacebookToken ? "graph.facebook.com" : "graph.instagram.com";
  const igUserId = isFacebookToken ? await resolveIgUserId() : "me";

  const url = new URL(`https://${host}/${graphVersion}/${igUserId}/media`);
  url.searchParams.set("fields", "id,caption,media_type,media_url,permalink,thumbnail_url,timestamp");
  url.searchParams.set("limit", String(postLimit));
  url.searchParams.set("access_token", token);

  const data = await fetchJson(url);
  return Array.isArray(data.data) ? data.data : [];
}

// Facebook 토큰용: IG 계정 ID를 환경변수 또는 (시스템 유저에 할당된) 페이지에서 찾는다.
async function resolveIgUserId() {
  const explicit = clean(process.env.INSTAGRAM_IG_USER_ID);
  if (explicit) return explicit;

  for (const edge of ["me/accounts", "me/assigned_pages"]) {
    const url = new URL(`https://graph.facebook.com/${graphVersion}/${edge}`);
    url.searchParams.set("fields", "id,name,instagram_business_account");
    url.searchParams.set("access_token", token);
    try {
      const data = await fetchJson(url);
      const hit = (data.data || []).find((page) => page.instagram_business_account?.id);
      if (hit) return hit.instagram_business_account.id;
    } catch {
      // 다음 엣지 시도
    }
  }
  throw new Error(
    "연결된 인스타그램 계정을 찾지 못했습니다. 비즈니스 설정에서 시스템 유저에 페이지/인스타 자산을 할당하거나 INSTAGRAM_IG_USER_ID 를 지정하세요.",
  );
}

async function refreshToken() {
  if (!token) {
    console.warn("[instagram] 갱신할 토큰이 없습니다.");
    return;
  }

  // 시스템 유저(EAA…) 토큰은 만료가 없어 갱신 대상이 아니다.
  if (token.startsWith("EAA")) {
    console.log("[instagram] Facebook 시스템 유저 토큰은 만료되지 않아 갱신을 건너뜁니다.");
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
  await writeFile(filePath, await optimizeImage(buffer));
}

// 원본(장당 1.5~2MB)을 그대로 서빙하면 홈이 10MB+ 가 되므로 그리드 표시용으로 줄인다.
// sharp 미설치 환경(로컬 등)에서는 원본을 그대로 저장한다 — 사이트는 안 깨진다.
async function optimizeImage(buffer) {
  try {
    const sharp = (await import("sharp")).default;
    return await sharp(buffer)
      .rotate()
      .resize({ width: 900, withoutEnlargement: true })
      .jpeg({ quality: 78, mozjpeg: true })
      .toBuffer();
  } catch (error) {
    console.warn(`[instagram] 이미지 최적화 생략(${error.message}) — 원본을 저장합니다.`);
    return buffer;
  }
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
