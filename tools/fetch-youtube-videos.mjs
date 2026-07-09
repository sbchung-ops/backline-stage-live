import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchJson, readExisting, clean, clampNumber } from "./_lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const playlistId = process.env.YOUTUBE_PLAYLIST_ID || "PL24svE8CNbW1ji87Ny9HIq1Kz8DU74oJd";
const channelId = String(process.env.YOUTUBE_CHANNEL_ID || "").trim();
const channelHandle = normalizeHandle(process.env.YOUTUBE_CHANNEL_HANDLE || "BacklineStage");
const videoLimit = clampNumber(process.env.YOUTUBE_VIDEO_LIMIT, 1, 25, 8);
const outputPath = path.resolve(root, process.env.YOUTUBE_OUTPUT || "assets/youtube-videos.json");
const apiKey = String(process.env.YOUTUBE_API_KEY || "").trim();

const videos = apiKey
  ? await fetchFromDataApi({ apiKey, playlistId, limit: videoLimit })
  : await fetchFromPublicSources({ playlistId, channelId, channelHandle, limit: videoLimit });

if (!videos.length) {
  const existing = await readExisting(outputPath);
  if (existing?.videos?.length) {
    console.warn(`[youtube] no public videos found for playlist ${playlistId}; keeping existing ${path.relative(root, outputPath)}`);
    process.exit(0);
  }

  videos.push(fallbackPlaylistVideo(playlistId));
}

const payload = {
  provider: apiKey ? "youtube-data-api" : "youtube-atom-feed",
  playlistId,
  updatedAt: new Date().toISOString(),
  videos,
};

// updatedAt 만 바뀐 경우 파일을 다시 쓰지 않는다 — 안 그러면 크론이 돌 때마다
// 커밋이 생겨 Netlify 빌드(크레딧)가 낭비된다. 실제 영상 목록이 바뀔 때만 커밋된다.
const previous = await readExisting(outputPath);
if (previous && sameFeedContent(previous, payload)) {
  console.log(`[youtube] 영상 변경 없음 — ${path.relative(root, outputPath)} 를 그대로 둡니다.`);
  process.exit(0);
}

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(`[youtube] wrote ${videos.length} videos to ${path.relative(root, outputPath)}`);

function sameFeedContent(a, b) {
  const strip = (x) => JSON.stringify({ provider: x.provider, playlistId: x.playlistId, videos: x.videos });
  return strip(a) === strip(b);
}

async function fetchFromDataApi({ apiKey, playlistId, limit }) {
  const url = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("playlistId", playlistId);
  url.searchParams.set("maxResults", String(limit));
  url.searchParams.set("key", apiKey);

  const data = await fetchJson(url);
  return (data.items || [])
    .map((item) => {
      const snippet = item.snippet || {};
      const id = snippet.resourceId?.videoId;
      if (!id) return null;
      return normalizeVideo({
        id,
        title: snippet.title,
        description: snippet.description,
        publishedAt: snippet.publishedAt,
        thumbnail: pickThumbnail(snippet.thumbnails) || thumbnailFor(id),
        channelTitle: snippet.videoOwnerChannelTitle || snippet.channelTitle,
      });
    })
    .filter(Boolean);
}

async function fetchFromPublicSources({ playlistId, channelId, channelHandle, limit }) {
  const playlistVideos = await fetchFromPlaylistAtomFeed({ playlistId, limit });
  if (playlistVideos.length) return playlistVideos;

  const resolvedChannelId = channelId || (channelHandle ? await resolveChannelId(channelHandle) : "");
  if (!resolvedChannelId) return [];
  return fetchFromChannelAtomFeed({ channelId: resolvedChannelId, limit });
}

async function fetchFromPlaylistAtomFeed({ playlistId, limit }) {
  const url = new URL("https://www.youtube.com/feeds/videos.xml");
  url.searchParams.set("playlist_id", playlistId);
  const xml = await fetchText(url);
  return videosFromAtomXml(xml, limit);
}

async function fetchFromChannelAtomFeed({ channelId, limit }) {
  const url = new URL("https://www.youtube.com/feeds/videos.xml");
  url.searchParams.set("channel_id", channelId);
  const xml = await fetchText(url);
  return videosFromAtomXml(xml, limit);
}

function videosFromAtomXml(xml, limit) {
  const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) || [];

  return entries
    .slice(0, limit)
    .map((entry) => {
      const id = readTag(entry, "yt:videoId");
      if (!id) return null;
      return normalizeVideo({
        id,
        title: readTag(entry, "title"),
        description: readTag(entry, "media:description"),
        publishedAt: readTag(entry, "published"),
        thumbnail: readAttribute(entry, "media:thumbnail", "url") || thumbnailFor(id),
        channelTitle: readTag(entry, "author") ? readTag(readTagBlock(entry, "author"), "name") : "",
      });
    })
    .filter(Boolean);
}

async function resolveChannelId(handle) {
  try {
    const html = await fetchText(`https://www.youtube.com/@${encodeURIComponent(handle)}`);
    const match =
      html.match(/"channelId":"(UC[a-zA-Z0-9_-]+)"/) ||
      html.match(/<meta\s+itemprop=["']channelId["']\s+content=["'](UC[a-zA-Z0-9_-]+)["']/i) ||
      html.match(/https:\/\/www\.youtube\.com\/channel\/(UC[a-zA-Z0-9_-]+)/);
    return match ? match[1] : "";
  } catch (error) {
    console.warn(`[youtube] could not resolve channel handle @${handle}: ${error.message}`);
    return "";
  }
}

async function fetchText(url) {
  const response = await fetch(url, { headers: { Accept: "application/atom+xml,text/xml" } });
  if (!response.ok) throw new Error(`YouTube feed failed: ${response.status} ${response.statusText}`);
  return response.text();
}

function normalizeVideo(video) {
  const id = clean(video.id);
  if (!id) return null;
  return {
    id,
    title: clean(video.title) || "Backline Stage 영상",
    description: clean(video.description),
    url: `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`,
    embedUrl: `https://www.youtube.com/embed/${encodeURIComponent(id)}?rel=0&modestbranding=1`,
    thumbnail: clean(video.thumbnail) || thumbnailFor(id),
    publishedAt: clean(video.publishedAt),
    channelTitle: clean(video.channelTitle) || "Backline Stage",
  };
}

function pickThumbnail(thumbnails = {}) {
  return ["maxres", "standard", "high", "medium", "default"]
    .map((key) => thumbnails[key]?.url)
    .find(Boolean);
}

function readTag(xml, tagName) {
  const block = readTagBlock(xml, tagName);
  if (!block) return "";
  return decodeXml(block.replace(new RegExp(`^<${escapeRegExp(tagName)}[^>]*>|</${escapeRegExp(tagName)}>$`, "g"), ""));
}

function readTagBlock(xml, tagName) {
  const match = xml.match(new RegExp(`<${escapeRegExp(tagName)}[^>]*>[\\s\\S]*?</${escapeRegExp(tagName)}>`, "i"));
  return match ? match[0] : "";
}

function readAttribute(xml, tagName, attrName) {
  const match = xml.match(new RegExp(`<${escapeRegExp(tagName)}[^>]*\\s${escapeRegExp(attrName)}=["']([^"']+)["'][^>]*>`, "i"));
  return match ? decodeXml(match[1]) : "";
}

function thumbnailFor(id) {
  return `https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg`;
}

function fallbackPlaylistVideo(playlistId) {
  return {
    id: "videoseries",
    title: "Backline Stage 유튜브 플레이리스트",
    description: "Backline Stage 유튜브 플레이리스트",
    url: `https://www.youtube.com/playlist?list=${encodeURIComponent(playlistId)}`,
    embedUrl: `https://www.youtube.com/embed/videoseries?list=${encodeURIComponent(playlistId)}&rel=0&modestbranding=1`,
    thumbnail: "./assets/poster-06.png",
    publishedAt: new Date().toISOString(),
    channelTitle: "Backline Stage",
  };
}

function decodeXml(value) {
  return String(value || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .trim();
}

function normalizeHandle(value) {
  return String(value || "")
    .trim()
    .replace(/^https?:\/\/(?:www\.)?youtube\.com\/@?/i, "")
    .replace(/^@/, "")
    .replace(/\/.*$/, "");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
