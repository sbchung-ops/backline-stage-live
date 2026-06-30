import { Admin } from "./api.js";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const flash = $("#flash");

function showFlash(kind, message, ms = 3200) {
  flash.innerHTML = `<div class="flash ${kind}">${escapeHtml(message)}</div>`;
  if (ms) window.setTimeout(() => (flash.innerHTML = ""), ms);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("`", "&#96;");
}

function toDateInput(row) {
  if (!row) return "";
  const y = Number(row.year);
  const m = String(row.month).padStart(2, "0");
  const d = String(row.day).padStart(2, "0");
  return y && m && d ? `${y}-${m}-${d}` : "";
}

function setLoading(form, isLoading, label = "저장") {
  const button = form.querySelector('button[type="submit"]');
  if (!button) return;
  button.disabled = isLoading;
  button.textContent = isLoading ? "처리 중..." : label;
}

function collectForm(form) {
  const fd = new FormData(form);
  const data = {};
  for (const [key, value] of fd.entries()) {
    if (value instanceof File) continue;
    data[key] = value === "" ? null : value;
  }
  return data;
}

// Tabs
const tabs = $("#tabs");
tabs.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-tab]");
  if (!button) return;

  const id = button.dataset.tab;
  $$("button[data-tab]", tabs).forEach((item) => item.classList.toggle("is-active", item === button));
  $$(".admin-panel").forEach((panel) => panel.classList.toggle("is-active", panel.dataset.panel === id));
  history.replaceState(null, "", `#${id}`);
});

function activateInitialTab() {
  const id = window.location.hash.replace("#", "");
  const button = id && $(`button[data-tab="${CSS.escape(id)}"]`, tabs);
  if (button) button.click();
}

$("#logout").addEventListener("click", (event) => {
  event.preventDefault();
  window.location.href = "/cdn-cgi/access/logout";
});

// Settings
const settingsForms = [$("#settings-form-contact"), $("#settings-form-links")];

async function loadSettings() {
  const data = await Admin.getSettings();
  if (!data) return;

  settingsForms.forEach((form) => {
    $$("input, textarea, select", form).forEach((field) => {
      if (field.name && data[field.name] != null) field.value = data[field.name];
    });
  });
}

settingsForms.forEach((form) => {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const label = form.id.includes("links") ? "링크 저장 →" : "정보 저장 →";
    const patch = collectForm(form);
    if ("latitude" in patch) patch.latitude = patch.latitude == null ? null : Number(patch.latitude);
    if ("longitude" in patch) patch.longitude = patch.longitude == null ? null : Number(patch.longitude);

    setLoading(form, true);
    try {
      await Admin.saveSettings(patch);
      showFlash("ok", "저장되었습니다.");
    } catch (error) {
      showFlash("err", error.message);
    } finally {
      setLoading(form, false, label);
    }
  });
});

// Venue
const venueForm = $("#venue-form");

async function loadVenue() {
  const data = await Admin.getVenue();
  if (!data) return;

  ["name", "tagline", "capacity", "stage_size", "sound", "light", "floorplan_url", "body"].forEach((key) => {
    if (venueForm.elements[key]) venueForm.elements[key].value = data[key] || "";
  });
  venueForm.elements.equipment_text.value = Array.isArray(data.equipment) ? data.equipment.join("\n") : "";
}

venueForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const fd = new FormData(venueForm);
  const equipment = String(fd.get("equipment_text") || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  setLoading(venueForm, true);
  try {
    await Admin.saveVenue({
      name: fd.get("name") || null,
      tagline: fd.get("tagline") || null,
      capacity: fd.get("capacity") || null,
      stage_size: fd.get("stage_size") || null,
      sound: fd.get("sound") || null,
      light: fd.get("light") || null,
      equipment,
      floorplan_url: fd.get("floorplan_url") || null,
      body: fd.get("body") || null,
    });
    showFlash("ok", "공연장 정보가 저장되었습니다.");
  } catch (error) {
    showFlash("err", error.message);
  } finally {
    setLoading(venueForm, false, "공연장 정보 저장 →");
  }
});

// Posters
const posterForm = $("#poster-form");
const posterList = $("#poster-list");

async function loadPosters() {
  try {
    const data = await Admin.listPosters();
    if (!data.length) {
      posterList.innerHTML = `<div class="card list-empty">등록된 이미지가 없습니다.</div>`;
      return;
    }

    posterList.innerHTML = data.map(renderPoster).join("");
  } catch (error) {
    posterList.innerHTML = `<div class="card list-empty">${escapeHtml(error.message)}</div>`;
  }
}

function renderPoster(poster) {
  return `
    <article class="poster-item" data-id="${escapeAttr(poster.id)}">
      <img class="poster-thumb" src="${escapeAttr(poster.image_url)}" alt="" loading="lazy" />
      <form class="poster-edit edit-grid">
        <div class="poster-item__top full">
          <div class="item-title">
            <strong>${escapeHtml(poster.title)}</strong>
            <span>${poster.year}.${String(poster.month).padStart(2, "0")}.${String(poster.day).padStart(2, "0")}</span>
          </div>
          <span class="badge">IMAGE</span>
        </div>
        <label>제목<input name="title" value="${escapeAttr(poster.title)}" required /></label>
        <label>날짜<input name="date" type="date" value="${toDateInput(poster)}" required /></label>
        <label class="full">이미지 교체 <small>선택하지 않으면 기존 이미지 유지</small><input name="file" type="file" accept="image/*" /></label>
        <div class="full row-actions">
          <button class="btn hot" type="submit">수정 저장 →</button>
          <button class="btn danger" type="button" data-action="delete-poster">삭제</button>
        </div>
      </form>
    </article>
  `;
}

posterForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const fd = new FormData(posterForm);
  const file = fd.get("file");
  if (!file || !(file instanceof File) || !file.size) return showFlash("err", "이미지 파일을 선택하세요.");
  if (file.size > 5 * 1024 * 1024) return showFlash("err", "파일은 5MB 이하만 업로드할 수 있습니다.");

  setLoading(posterForm, true);
  try {
    await Admin.uploadPoster(fd);
    posterForm.reset();
    showFlash("ok", "이미지가 업로드되었습니다.");
    await loadPosters();
  } catch (error) {
    showFlash("err", error.message);
  } finally {
    setLoading(posterForm, false, "업로드 →");
  }
});

posterList.addEventListener("submit", async (event) => {
  const form = event.target.closest(".poster-edit");
  if (!form) return;
  event.preventDefault();

  const item = form.closest(".poster-item");
  const fd = new FormData(form);
  const file = fd.get("file");
  if (file instanceof File && file.size > 5 * 1024 * 1024) return showFlash("err", "파일은 5MB 이하만 업로드할 수 있습니다.");

  setLoading(form, true);
  try {
    await Admin.updatePoster(item.dataset.id, fd);
    showFlash("ok", "이미지 정보가 수정되었습니다.");
    await loadPosters();
  } catch (error) {
    showFlash("err", error.message);
  } finally {
    setLoading(form, false, "수정 저장 →");
  }
});

posterList.addEventListener("click", async (event) => {
  const button = event.target.closest('[data-action="delete-poster"]');
  if (!button) return;
  if (!confirm("이 이미지를 삭제할까요? 스토리지 파일도 함께 삭제됩니다.")) return;

  const id = button.closest(".poster-item").dataset.id;
  try {
    await Admin.deletePoster(id);
    showFlash("ok", "이미지가 삭제되었습니다.");
    await loadPosters();
  } catch (error) {
    showFlash("err", error.message);
  }
});

$('[data-action="refresh-posters"]').addEventListener("click", loadPosters);

// Notices
const noticeForm = $("#notice-form");
const noticeList = $("#notice-list");

async function loadNotices() {
  try {
    const data = await Admin.listNotices();
    if (!data.length) {
      noticeList.innerHTML = `<div class="card list-empty">등록된 공지가 없습니다.</div>`;
      return;
    }

    noticeList.innerHTML = data.map(renderNotice).join("");
  } catch (error) {
    noticeList.innerHTML = `<div class="card list-empty">${escapeHtml(error.message)}</div>`;
  }
}

function renderNotice(notice) {
  const date = notice.published_at ? new Date(notice.published_at).toLocaleDateString("ko-KR") : "";
  return `
    <article class="notice-item" data-id="${escapeAttr(notice.id)}">
      <form class="notice-edit edit-grid">
        <div class="notice-item__top full">
          <div class="item-title">
            <strong>${escapeHtml(notice.title)}</strong>
            <span>${escapeHtml(date)} · ${escapeHtml((notice.body_short || "").slice(0, 80))}</span>
          </div>
          ${notice.pinned ? '<span class="badge">PINNED</span>' : '<span class="badge">NOTICE</span>'}
        </div>
        <label>제목<input name="title" value="${escapeAttr(notice.title)}" required /></label>
        <label>노출 상태
          <select name="pinned">
            <option value="false"${notice.pinned ? "" : " selected"}>일반</option>
            <option value="true"${notice.pinned ? " selected" : ""}>상단 고정</option>
          </select>
        </label>
        <label class="full">두 줄 미리보기<textarea name="body_short" maxlength="160" rows="2">${escapeHtml(notice.body_short || "")}</textarea></label>
        <label class="full">상세 내용<textarea name="body" rows="4">${escapeHtml(notice.body || "")}</textarea></label>
        <div class="full row-actions">
          <button class="btn hot" type="submit">수정 저장 →</button>
          <button class="btn danger" type="button" data-action="delete-notice">삭제</button>
        </div>
      </form>
    </article>
  `;
}

noticeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const fd = new FormData(noticeForm);

  setLoading(noticeForm, true);
  try {
    await Admin.createNotice({
      title: fd.get("title"),
      body_short: fd.get("body_short"),
      body: fd.get("body"),
      pinned: fd.get("pinned") === "true",
    });
    noticeForm.reset();
    showFlash("ok", "공지가 등록되었습니다.");
    await loadNotices();
  } catch (error) {
    showFlash("err", error.message);
  } finally {
    setLoading(noticeForm, false, "공지 등록 →");
  }
});

noticeList.addEventListener("submit", async (event) => {
  const form = event.target.closest(".notice-edit");
  if (!form) return;
  event.preventDefault();

  const fd = new FormData(form);
  const id = form.closest(".notice-item").dataset.id;

  setLoading(form, true);
  try {
    await Admin.updateNotice(id, {
      title: fd.get("title"),
      body_short: fd.get("body_short"),
      body: fd.get("body"),
      pinned: fd.get("pinned") === "true",
    });
    showFlash("ok", "공지가 수정되었습니다.");
    await loadNotices();
  } catch (error) {
    showFlash("err", error.message);
  } finally {
    setLoading(form, false, "수정 저장 →");
  }
});

noticeList.addEventListener("click", async (event) => {
  const button = event.target.closest('[data-action="delete-notice"]');
  if (!button) return;
  if (!confirm("이 공지를 삭제할까요?")) return;

  const id = button.closest(".notice-item").dataset.id;
  try {
    await Admin.deleteNotice(id);
    showFlash("ok", "공지가 삭제되었습니다.");
    await loadNotices();
  } catch (error) {
    showFlash("err", error.message);
  }
});

$('[data-action="refresh-notices"]').addEventListener("click", loadNotices);

async function boot() {
  activateInitialTab();
  try {
    await Promise.all([loadSettings(), loadVenue(), loadPosters(), loadNotices()]);
  } catch (error) {
    showFlash("err", error.message, 0);
  }
}

boot();
