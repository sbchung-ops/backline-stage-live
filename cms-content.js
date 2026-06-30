(() => {
  const state = {
    content: null,
    ready: false,
  };

  window.BacklineCMS = state;

  loadCmsContent();

  async function loadCmsContent() {
    try {
      const url = new URL("./assets/cms-content.json", document.baseURI);
      const res = await fetch(url, { cache: "no-store", headers: { Accept: "application/json" } });
      if (!res.ok) return;

      const content = await res.json();
      state.content = content;
      applySettings(content.settings || {});
      if (content.sources?.equipment === "cms") applyEquipment(content.equipment || []);
      if (content.sources?.photos === "cms") applyPhotos(content.photos || []);
      state.ready = true;
      document.documentElement.dataset.cmsReady = "true";
    } catch {
      // Static fallback HTML stays usable if the CMS snapshot is missing.
    }
  }

  function applySettings(settings) {
    const phone = clean(settings.phone);
    const email = clean(settings.email);
    const kakao = clean(settings.kakao_url);
    const instagram = clean(settings.instagram_url);
    const youtube = clean(settings.youtube_url);
    const playlist = clean(settings.youtube_playlist_url);
    const address = clean(settings.address);
    const representative = clean(settings.representative);
    const lat = Number(settings.latitude);
    const lng = Number(settings.longitude);
    const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);

    if (email) {
      setLinks('a[href^="mailto:"]', `mailto:${email}`);
      replaceText("BacklineStageOfficial@gmail.com", email);
    }

    if (phone) {
      setLinks('a[href^="tel:"]', `tel:${phone.replace(/[^\d+]/g, "")}`);
      replaceText("010-3402-4358", phone);
    }

    if (kakao) setLinks('a[href*="pf.kakao.com"]', kakao);
    if (instagram) setLinks('a[href*="instagram.com"]', instagram);
    if (youtube) setLinks('a[href*="youtube.com/@BacklineStage"]', youtube);
    if (playlist) setLinks('a[href*="youtube.com/playlist"]', playlist);

    if (representative) {
      replaceText("대표자: 정운화 · 오원석", `대표자: ${representative}`);
      replaceText("대표자:정운화.오원석", `대표자: ${representative}`);
    }

    if (address) {
      document.querySelectorAll('[data-bind="venue.address"], .addr-link').forEach((node) => {
        node.textContent = address;
      });
      replaceText("서울 마포구 와우산로 18길 20 지하1층", address);
      replaceText("서울 마포구 와우산로 18길 20 B1", address.replace("지하1층", "B1"));
    }

    if (!hasCoords) return;

    const mapLabel = encodeURIComponent("Backline Stage");
    const encodedAddress = encodeURIComponent(address || "서울 마포구 와우산로 18길 20 지하1층");
    const kakaoMap = `https://map.kakao.com/link/map/${mapLabel},${lat},${lng}`;
    const kakaoRoute = `https://map.kakao.com/link/to/${mapLabel},${lat},${lng}`;
    const naverMap = clean(settings.naver_map_url) || `https://map.naver.com/p/search/${encodedAddress}`;
    const googleSearch = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    const googleRoute = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
    const googleEmbed = `https://maps.google.com/maps?q=${lat},${lng}&z=17&output=embed`;

    document.querySelectorAll('a[href*="map.kakao.com/link/map"]').forEach((node) => {
      node.href = kakaoMap;
    });
    document.querySelectorAll('a[href*="map.kakao.com/link/to"], a[data-mapaction="kakao"]').forEach((node) => {
      node.href = kakaoRoute;
    });
    document.querySelectorAll('a[href*="map.naver.com"], a[data-mapaction="naver"]').forEach((node) => {
      node.href = naverMap;
    });
    document.querySelectorAll('a[href*="google.com/maps/search"]').forEach((node) => {
      node.href = googleSearch;
    });
    document.querySelectorAll('a[href*="google.com/maps/dir"], a[data-mapaction="google"]').forEach((node) => {
      node.href = googleRoute;
    });
    document.querySelectorAll('iframe[src*="maps.google.com/maps"]').forEach((node) => {
      node.src = googleEmbed;
    });
  }

  function applyEquipment(equipment) {
    const grid = document.querySelector(".gear-grid");
    if (!grid || equipment.length < 3) return;

    const cards = equipment.some((item) => item.model) ? groupEquipment(equipment) : equipment;
    grid.innerHTML = cards
      .map((card) => {
        const items = Array.isArray(card.items) ? card.items : [card.model, card.quantity, card.note].filter(Boolean);
        return `
          <div class="gear-card">
            <div class="gear-cat">${escapeHtml(card.category || "Equipment")}</div>
            <h4>${escapeHtml(card.title || card.category || "Equipment")}</h4>
            <ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
          </div>
        `;
      })
      .join("");
  }

  function groupEquipment(equipment) {
    const groups = new Map();

    for (const item of equipment) {
      const category = clean(item.category) || "Equipment";
      if (!groups.has(category)) {
        groups.set(category, {
          category,
          title: item.isOption ? "Additional operation" : category,
          items: [],
        });
      }

      const values = [item.model || item.title, item.quantity, item.note, item.price].filter(Boolean);
      if (values.length) groups.get(category).items.push(values.join(" · "));
    }

    return [...groups.values()].filter((group) => group.items.length);
  }

  function applyPhotos(photos) {
    const masonry = document.querySelector(".masonry");
    if (!masonry || photos.length < 3) return;

    masonry.innerHTML = photos
      .map((photo) => {
        const image = photo.image || {};
        const src = clean(image.url);
        if (!src) return "";

        return `
          <div class="m-cell">
            <img src="${escapeAttr(src)}" alt="${escapeAttr(image.alt || photo.title || "Backline Stage photo")}" loading="lazy" decoding="async" />
            <span class="m-label">${escapeHtml(photo.category || "IMAGE")}</span>
          </div>
        `;
      })
      .join("");
  }

  function setLinks(selector, href) {
    document.querySelectorAll(selector).forEach((node) => {
      node.href = href;
    });
  }

  function replaceText(from, to) {
    if (!from || !to || from === to || !document.body) return;

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);

    nodes.forEach((node) => {
      if (node.nodeValue.includes(from)) {
        node.nodeValue = node.nodeValue.replaceAll(from, to);
      }
    });
  }

  function clean(value) {
    return String(value ?? "").trim();
  }

  function escapeHtml(value) {
    return clean(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function escapeAttr(value) {
    return escapeHtml(value).replaceAll("'", "&#39;");
  }
})();
