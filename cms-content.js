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
      applySections(content.sections || {});
      if (content.sources?.venuePhotos === "cms") applyVenueCarousel(content.venuePhotos || []);
      if (content.sources?.schedules === "cms") {
        applyScheduleGallery(content.schedules || []);
        applyPosterOrbit(content.schedules || []);
      }
      if (content.sources?.equipment === "cms") applyEquipment(content.equipment || []);
      if (content.sources?.galleryPhotos === "cms") applyGalleryPhotos(content.galleryPhotos || []);
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
    const applicationForm = toGoogleFormViewUrl(clean(settings.application_form_url || settings.rental_form_url || settings.google_form_url));
    const applicationFormEmbed = clean(settings.application_form_embed_url) || toGoogleFormEmbedUrl(applicationForm);
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

    // 장비 리스트/큐시트 엑셀 — Sanity 에 업로드된 파일이 있으면 다운로드 버튼을 그 파일로 교체.
    // CDN 은 다른 도메인이라 download 속성이 무시되므로 ?dl= 로 강제 다운로드시킨다.
    const equipmentFile = clean(settings.equipment_file_url);
    if (equipmentFile) {
      const fileName = clean(settings.equipment_file_name) || "equipment-list.xlsx";
      const sep = equipmentFile.includes("?") ? "&" : "?";
      setLinks('a[href*="equipment-list.xlsx"]', `${equipmentFile}${sep}dl=${encodeURIComponent(fileName)}`);
    }

    if (kakao) setLinks('a[href*="pf.kakao.com"]', kakao);
    if (instagram) setLinks('a[href*="instagram.com"]', instagram);
    if (youtube) setLinks('a[href*="youtube.com/@BacklineStage"]', youtube);
    if (playlist) setLinks('a[href*="youtube.com/playlist"]', playlist);
    if (applicationForm) setLinks('a[href*="docs.google.com/forms"]', applicationForm);
    if (applicationFormEmbed) setFormEmbeds(applicationFormEmbed);

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

  function applySections(sections) {
    for (const [key, section] of Object.entries(sections)) {
      const root = document.querySelector(`[data-cms-section="${key}"]`);
      if (!root) continue;

      setField(root, "eyebrow", section.eyebrow);
      setField(root, "heading", section.heading, true);
      setField(root, "body", section.body);

      const button = root.querySelector('[data-cms-field="button"]');
      if (button) {
        if (section.buttonLabel) button.textContent = section.buttonLabel;
        if (section.buttonUrl) button.href = section.buttonUrl;
      }
    }
  }

  function applyVenueCarousel(photos) {
    const carousel = document.querySelector("[data-venue-carousel]");
    if (!carousel || !photos.length) return;

    const slides = [...carousel.querySelectorAll("[data-carousel-slide]")];
    slides.forEach((slide, index) => {
      const photo = photos[index % photos.length];
      if (!photo) return;

      const img = slide.querySelector("img");
      const tag = slide.querySelector(".venue-carousel__tag");
      const image = photo.image || {};

      if (img && image.url) {
        img.src = image.url;
        img.alt = image.alt || photo.caption || photo.title || "Backline Stage venue photo";
      }

      if (tag) tag.textContent = photo.caption || photo.category || photo.title || `PHOTO ${index + 1}`;
      slide.setAttribute("aria-label", `${index + 1} / ${slides.length}`);
    });
  }

  function applyScheduleGallery(schedules) {
    const grid = document.querySelector(".poster-gallery");
    if (!grid || !schedules.length) return;

    grid.innerHTML = schedules
      .map((item) => {
        const image = item.image || {};
        const url = clean(item.url || "./contact.html");
        const src = clean(image.url);
        if (!src) return "";

        return `
          <a class="poster-card" href="${escapeAttr(url)}">
            <span class="date-badge">${escapeHtml(badge(item) || "LIVE")}</span>
            <img src="${escapeAttr(src)}" alt="${escapeAttr(image.alt || item.title || "공연 포스터")}" loading="lazy" decoding="async" />
            <span class="meta">${escapeHtml(item.title || "공연 예정")}</span>
          </a>
        `;
      })
      .join("");
  }

  function applyPosterOrbit(schedules) {
    const orbit = document.querySelector("[data-poster-orbit]");
    if (!orbit) return;

    const stage = orbit.querySelector("[data-poster-stage]");
    const emptyNote = document.querySelector("[data-poster-empty]");

    const upcomingSchedules = schedules.filter(isUpcomingSchedule);
    const featured = upcomingSchedules.filter((item) => item.featured !== false);
    const source = featured.length ? featured : upcomingSchedules;
    const items = source.filter((item) => clean(item.image?.url)).slice(0, 8);
    // 링크 미지정 포스터는 대관 일정의 예정 공연 섹션으로 보낸다.
    const defaultUrl = "./schedule.html#upcoming";

    // 데이터가 없으면 오르빗을 숨기고 "준비된 공연이 없습니다" 문구를 노출한다.
    if (!items.length || !stage) {
      orbit.hidden = true;
      if (emptyNote) emptyNote.hidden = false;
      return;
    }

    // 등록된 개수만큼(1개여도) 카드를 재구성한다 — 더미로 채우지 않는다.
    stage.innerHTML = items
      .map((item) => {
        const image = item.image || {};
        const url = clean(item.url) || defaultUrl;
        const dateLabel = badge(item) || "LIVE";
        return `
          <a class="poster-card" href="${escapeAttr(url)}" data-poster-card data-title="${escapeAttr(item.title || "공연 예정")}" data-date="${escapeAttr(dateLabel)}">
            <span class="date-badge">${escapeHtml(dateLabel)}</span>
            <img src="${escapeAttr(image.url)}" alt="${escapeAttr(image.alt || item.title || "공연 포스터")}" loading="lazy" decoding="async" />
            <span class="meta">${escapeHtml(item.title || "공연 예정")}</span>
          </a>`;
      })
      .join("");

    if (emptyNote) emptyNote.hidden = true;
    orbit.hidden = false;
    orbit.dataset.initialIndex = String(Math.min(2, items.length - 1));

    if (typeof window.setupPosterOrbit === "function") window.setupPosterOrbit(orbit);
  }

  function applyGalleryPhotos(photos) {
    const masonry = document.querySelector(".masonry");
    if (!masonry || !photos.length) return;

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

  function setField(root, field, value, allowBreaks = false) {
    const node = root.querySelector(`[data-cms-field="${field}"]`);
    if (!node || !clean(value)) return;

    if (allowBreaks) {
      node.innerHTML = escapeHtml(value).replace(/\n/g, "<br />");
    } else {
      node.textContent = value;
    }
  }

  function setLinks(selector, href) {
    document.querySelectorAll(selector).forEach((node) => {
      node.href = href;
    });
  }

  function setFormEmbeds(src) {
    document.querySelectorAll('iframe[src*="docs.google.com/forms"], iframe[data-form-src*="docs.google.com/forms"]').forEach((node) => {
      node.src = src;
      node.dataset.formSrc = src;
    });
  }

  function toGoogleFormEmbedUrl(url) {
    if (!url) return "";

    try {
      const embedUrl = new URL(url, document.baseURI);
      if (!embedUrl.hostname.includes("docs.google.com") || !embedUrl.pathname.includes("/forms/")) return url;
      embedUrl.search = "embedded=true";
      return embedUrl.toString();
    } catch {
      return url;
    }
  }

  function toGoogleFormViewUrl(url) {
    if (!url) return "";

    try {
      const viewUrl = new URL(url, document.baseURI);
      if (!viewUrl.hostname.includes("docs.google.com") || !viewUrl.pathname.includes("/forms/")) return url;
      if (viewUrl.searchParams.has("embedded")) {
        viewUrl.searchParams.delete("embedded");
        if (!viewUrl.search) viewUrl.searchParams.set("usp", "header");
      }
      return viewUrl.toString();
    } catch {
      return url;
    }
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

  // 직접 지정한 날짜 표시가 있으면 그것을, 없으면 공연일로 자동 계산한다.
  function badge(item) {
    return clean(item.dateBadge) || badgeFor(item.eventDate || item.date);
  }

  function isUpcomingSchedule(item) {
    const eventDate = parseEventDate(item.eventDate || item.date);
    if (!eventDate) return true;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return eventDate.getTime() >= today.getTime();
  }

  function parseEventDate(value) {
    const raw = clean(value);
    const match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (!match) return null;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(year, month - 1, day);

    if (
      Number.isNaN(date.getTime()) ||
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day
    ) {
      return null;
    }

    date.setHours(0, 0, 0, 0);
    return date;
  }

  // 공연일(YYYY-MM-DD) → 접속 시점 기준 뱃지: TODAY / D-3 / 07.12 SAT
  function badgeFor(dateStr) {
    const raw = clean(dateStr);
    const parts = raw.split("-").map(Number);
    if (parts.length < 3 || parts.some(Number.isNaN)) return "";

    const ev = new Date(parts[0], parts[1] - 1, parts[2]);
    if (Number.isNaN(ev.getTime())) return "";
    ev.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const diff = Math.round((ev.getTime() - today.getTime()) / 86400000);
    if (diff === 0) return "TODAY";
    if (diff > 0 && diff <= 7) return `D-${diff}`;

    const weekday = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][ev.getDay()];
    const mm = String(ev.getMonth() + 1).padStart(2, "0");
    const dd = String(ev.getDate()).padStart(2, "0");
    return `${mm}.${dd} ${weekday}`;
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
