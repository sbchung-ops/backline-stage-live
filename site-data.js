(async () => {
  const defaults = {
    email: "BacklineStageOfficial@gmail.com",
    kakao_url: "http://pf.kakao.com/_UpUKX",
    instagram_url: "https://www.instagram.com/backline_stage_official/",
    youtube_url: "https://www.youtube.com/@BacklineStage",
    youtube_playlist_url: "https://www.youtube.com/playlist?list=PL24svE8CNbW1ji87Ny9HIq1Kz8DU74oJd",
    address: "서울 마포구 와우산로 18길 20 지하1층",
    latitude: 37.5510009887565,
    longitude: 126.924016871226,
    representative: "정운화 · 오원석",
  };

  const [settings, venue] = await Promise.all([readJson("/api/settings"), readJson("/api/venue")]);
  if (settings) applySettings({ ...defaults, ...settings });
  if (venue) applyVenue(venue);

  async function readJson(path) {
    try {
      const res = await fetch(path, { headers: { Accept: "application/json" } });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  function applySettings(settings) {
    const email = clean(settings.email) || defaults.email;
    const kakao = clean(settings.kakao_url) || defaults.kakao_url;
    const instagram = clean(settings.instagram_url) || defaults.instagram_url;
    const youtube = clean(settings.youtube_url) || defaults.youtube_url;
    const playlist = clean(settings.youtube_playlist_url) || defaults.youtube_playlist_url;
    const address = clean(settings.address) || defaults.address;
    const lat = Number(settings.latitude || defaults.latitude);
    const lng = Number(settings.longitude || defaults.longitude);
    const representative = clean(settings.representative) || defaults.representative;

    setLinks('a[href^="mailto:"]', `mailto:${email}`);
    setLinks('a[href*="pf.kakao.com"]', kakao);
    setLinks('a[href*="instagram.com"]', instagram);
    setLinks('a[href*="youtube.com/@BacklineStage"]', youtube);
    setLinks('a[href*="youtube.com/playlist"]', playlist);
    setTextMatches(defaults.email, email);
    setTextMatches("대표자: 정운화 · 오원석", `대표자: ${representative}`);

    document.querySelectorAll('[data-bind="venue.address"], .addr-link').forEach((node) => {
      node.textContent = address;
    });

    const mapLabel = encodeURIComponent("Backline Stage");
    const kakaoMap = `https://map.kakao.com/link/map/${mapLabel},${lat},${lng}`;
    const kakaoRoute = `https://map.kakao.com/link/to/${mapLabel},${lat},${lng}`;
    const googleSearch = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    const googleRoute = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
    const googleEmbed = `https://maps.google.com/maps?q=${lat},${lng}&z=17&output=embed`;

    document.querySelectorAll('a[href*="map.kakao.com/link/map"]').forEach((node) => (node.href = kakaoMap));
    document.querySelectorAll('a[href*="map.kakao.com/link/to"], a[data-mapaction="kakao"]').forEach((node) => {
      node.href = kakaoRoute;
    });
    document.querySelectorAll('a[href*="google.com/maps/search"]').forEach((node) => (node.href = googleSearch));
    document.querySelectorAll('a[href*="google.com/maps/dir"], a[data-mapaction="google"]').forEach((node) => {
      node.href = googleRoute;
    });
    document.querySelectorAll('iframe[src*="maps.google.com/maps"]').forEach((node) => (node.src = googleEmbed));

    const listId = getPlaylistId(playlist);
    if (listId) {
      document.querySelectorAll('iframe[src*="youtube.com/embed/videoseries"]').forEach((node) => {
        node.src = `https://www.youtube.com/embed/videoseries?list=${encodeURIComponent(listId)}&rel=0&modestbranding=1`;
      });
    }
  }

  function applyVenue(venue) {
    const replacements = {
      "최대 140명": venue.capacity,
      "6.6 × 4.3 m": venue.stage_size,
      "Live PA · LIGHT": [venue.sound, venue.light].filter(Boolean).join(" · "),
    };

    for (const [from, to] of Object.entries(replacements)) {
      if (to) setTextMatches(from, to);
    }
  }

  function getPlaylistId(url) {
    try {
      return new URL(url).searchParams.get("list");
    } catch {
      return "";
    }
  }

  function setLinks(selector, href) {
    document.querySelectorAll(selector).forEach((node) => {
      node.href = href;
    });
  }

  function setTextMatches(from, to) {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((node) => {
      if (node.nodeValue.includes(from)) node.nodeValue = node.nodeValue.replaceAll(from, to);
    });
  }

  function clean(value) {
    return String(value ?? "").trim();
  }
})();
