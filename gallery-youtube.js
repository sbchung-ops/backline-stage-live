(() => {
  const list = document.querySelector("[data-youtube-list]");
  const featured = document.querySelector("[data-youtube-featured]");
  const status = document.querySelector("[data-youtube-status]");
  if (!list || !featured) return;

  init();

  async function init() {
    try {
      const response = await fetch("./assets/youtube-videos.json", { cache: "no-store" });
      if (!response.ok) throw new Error(`YouTube data ${response.status}`);
      const data = await response.json();
      const videos = Array.isArray(data.videos) ? data.videos.filter((video) => video?.id) : [];
      if (!videos.length) return;
      renderVideos(videos, data);
    } catch (error) {
      if (status) status.textContent = "YouTube 자동 목록을 불러오지 못해 기본 플레이리스트를 표시 중입니다.";
      console.warn("[gallery-youtube]", error);
    }
  }

  function renderVideos(videos, data) {
    const first = videos[0];
    featured.src = first.embedUrl || `https://www.youtube.com/embed/${encodeURIComponent(first.id)}?rel=0&modestbranding=1`;
    featured.title = first.title ? `Backline Stage 최신 영상 - ${first.title}` : "Backline Stage 최신 영상";

    list.replaceChildren(...videos.slice(0, 4).map(createVideoItem));
    if (status) {
      if (first.id === "videoseries" || data.provider === "manual-fallback") {
        status.textContent = "유튜브 공개 영상 준비 중 · 현재는 플레이리스트를 표시합니다.";
      } else {
        const stamp = data.updatedAt ? `${formatDate(data.updatedAt)} 기준` : "자동 갱신";
        status.textContent = `최근 유튜브 영상 자동 업데이트 · ${stamp}`;
      }
    }
  }

  function createVideoItem(video, index) {
    const link = document.createElement("a");
    link.className = "yt-item";
    link.href = video.url || `https://www.youtube.com/watch?v=${encodeURIComponent(video.id)}`;
    link.target = "_blank";
    link.rel = "noopener";

    const image = document.createElement("img");
    image.src = video.thumbnail || `https://i.ytimg.com/vi/${encodeURIComponent(video.id)}/hqdefault.jpg`;
    image.alt = "";
    image.loading = "lazy";

    const body = document.createElement("div");
    const cat = document.createElement("div");
    cat.className = "yt-cat";
    cat.textContent = video.id === "videoseries" ? "Playlist" : index === 0 ? "Latest upload" : formatDate(video.publishedAt) || "YouTube";

    const title = document.createElement("div");
    title.className = "yt-title";
    title.textContent = video.title || "Backline Stage 영상";

    body.append(cat, title);
    link.append(image, body);
    return link;
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  }
})();
