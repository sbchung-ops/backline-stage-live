(() => {
  // 할인 이벤트 팝업 + 대관 비용 표시.
  // 데이터: ./assets/cms-content.json 의 pricing (Sanity "대관 비용 · 할인 이벤트" 문서).
  // 스냅샷이 없으면 아래 defaults 로 동작한다 — 기본가는 rental.html 하드코딩 값과 동일하게 유지할 것.
  // 미리보기: 아무 페이지나 ?promo=preview 를 붙이면 Sanity 설정과 무관하게 예시 이벤트가 켜진다.
  const defaults = {
    weekday: "800,000",
    fridaySunday: "1,000,000",
    peak: "1,100,000",
    promo: {
      enabled: false,
      end_date: "",
      discount_label: "25% OFF",
      weekday_sale: "600,000",
      friday_sunday_sale: "",
      peak_sale: "",
      badge: "EVENT",
      title: "대관료 할인 이벤트",
      body: "지금 대관 문의하시면 요일별 대관료와 옵션 견적을 안내드립니다.\n마감 전에 일정을 먼저 확인해 보세요.",
      button_label: "할인가 확인하기 →",
    },
  };

  const HIDE_KEY = "blsg-promo-hide-until";
  const isPreview = new URLSearchParams(window.location.search).get("promo") === "preview";

  init();

  async function init() {
    const pricing = mergePricing(await loadPricing());
    const promo = pricing.promo;
    const active = isPreview || isPromoActive(promo);

    applyPriceCards(pricing, active);
    if (active && document.body.hasAttribute("data-promo-popup") && shouldShowPopup()) {
      showPopup(promo);
    }
  }

  async function loadPricing() {
    try {
      const url = new URL("./assets/cms-content.json", document.baseURI);
      const res = await fetch(url, { cache: "no-store", headers: { Accept: "application/json" } });
      if (!res.ok) return null;
      const content = await res.json();
      return content && typeof content.pricing === "object" ? content.pricing : null;
    } catch {
      return null; // 스냅샷이 없어도 하드코딩 가격 그대로 노출
    }
  }

  function mergePricing(cms) {
    const promo = { ...defaults.promo, ...(cms?.promo || {}) };
    if (clean(promo.body).includes("평일·주말")) promo.body = defaults.promo.body;
    if (isPreview) promo.enabled = true;
    return {
      weekday: clean(cms?.weekday) || defaults.weekday,
      fridaySunday: clean(cms?.friday_sunday) || defaults.fridaySunday,
      peak: clean(cms?.peak) || defaults.peak,
      promo,
    };
  }

  function isPromoActive(promo) {
    if (promo.enabled !== true) return false;
    const end = clean(promo.end_date);
    if (!end) return true;
    const parts = end.split("-").map(Number);
    if (parts.length < 3 || parts.some(Number.isNaN)) return true;
    const endOfDay = new Date(parts[0], parts[1] - 1, parts[2], 23, 59, 59);
    return Date.now() <= endOfDay.getTime();
  }

  // ─── 대관 안내: 가격 카드 ────────────────────────────────────────
  function applyPriceCards(pricing, promoActive) {
    const grid = document.querySelector(".price-grid");
    if (!grid) return;

    renderCard(grid, "weekday", pricing.weekday, promoActive ? pricing.promo : null, pricing.promo.weekday_sale);
    renderCard(grid, "fridaySunday", pricing.fridaySunday, promoActive ? pricing.promo : null, pricing.promo.friday_sunday_sale);
    renderCard(grid, "peak", pricing.peak, promoActive ? pricing.promo : null, pricing.promo.peak_sale);
  }

  function renderCard(grid, priceKey, base, promo, saleAmount) {
    const card = grid.querySelector(`.price-card[data-price-key="${priceKey}"]`);
    const amount = card?.querySelector(".amount");
    if (!amount) return;

    const sale = promo ? clean(saleAmount) || calculateDiscountedAmount(base, promo.discount_label) : "";
    if (sale) {
      amount.classList.add("amount--sale");
      amount.innerHTML = `<s class="amount-was">${escapeHtml(formatWon(base))}</s><span class="amount-now">${escapeHtml(formatWon(sale))}<small>원</small></span>`;
      const label = clean(promo.discount_label);
      if (label && !card.querySelector(".sale-flag")) {
        card.querySelector(".price-tag").insertAdjacentHTML("afterend", `<span class="sale-flag">${escapeHtml(label)}</span>`);
      }
    } else {
      amount.classList.remove("amount--sale");
      amount.innerHTML = `${escapeHtml(formatWon(base))}<small>원</small>`;
    }
  }

  // "800000" / "800,000" → "800,000". 숫자가 아니면(협의 등) 입력 그대로 노출.
  function formatWon(value) {
    const raw = clean(value).replaceAll(",", "");
    if (!/^\d+$/.test(raw)) return clean(value);
    return Number(raw).toLocaleString("ko-KR");
  }

  function calculateDiscountedAmount(base, label) {
    const baseNumber = Number(clean(base).replaceAll(",", ""));
    const match = clean(label).match(/(\d+(?:\.\d+)?)\s*%/);
    if (!Number.isFinite(baseNumber) || !match) return "";
    const rate = Number(match[1]);
    if (!Number.isFinite(rate) || rate <= 0 || rate >= 100) return "";
    return String(Math.round((baseNumber * (100 - rate)) / 100));
  }

  // ─── 홈: 광고 팝업 ───────────────────────────────────────────────
  // "오늘 하루 보지 않기"를 누르지 않는 한 홈에 올 때마다 다시 뜬다 (닫기는 이번 화면에서만 닫음).
  function shouldShowPopup() {
    if (isPreview) return true;
    try {
      if (window.localStorage.getItem(HIDE_KEY) === todayStr()) return false;
    } catch {
      // 스토리지를 못 쓰는 환경이면 그냥 보여준다
    }
    return true;
  }

  function showPopup(promo) {
    const ctaHref = isPreview ? "./rental.html?promo=preview#pricing" : "./rental.html#pricing";
    const root = document.createElement("div");
    root.className = "promo-popup";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-labelledby", "promo-popup-title");
    root.innerHTML = `
      <div class="promo-popup__card">
        <button class="promo-popup__x" type="button" data-promo-close aria-label="팝업 닫기">×</button>
        <img class="promo-popup__mascot" src="./assets/brand/original-white/mascot-white.png" alt="" />
        <span class="tag hot">${escapeHtml(clean(promo.badge) || "EVENT")}</span>
        <h3 id="promo-popup-title">${escapeHtml(clean(promo.title) || defaults.promo.title)}</h3>
        <p>${escapeHtml(clean(promo.body) || defaults.promo.body).replace(/\n/g, "<br />")}</p>
        <a class="btn hot promo-popup__cta" href="${ctaHref}">${escapeHtml(clean(promo.button_label) || defaults.promo.button_label)}</a>
        <div class="promo-popup__foot">
          <button type="button" data-promo-hide-today>오늘 하루 보지 않기</button>
          <button type="button" data-promo-close>닫기</button>
        </div>
      </div>
    `;

    const close = () => {
      root.classList.remove("is-open");
      window.setTimeout(() => root.remove(), 220);
      document.removeEventListener("keydown", onKeydown);
    };
    const onKeydown = (event) => {
      if (event.key === "Escape") close();
    };

    root.querySelectorAll("[data-promo-close]").forEach((node) => node.addEventListener("click", close));
    root.querySelector("[data-promo-hide-today]").addEventListener("click", () => {
      try {
        window.localStorage.setItem(HIDE_KEY, todayStr());
      } catch {}
      close();
    });
    document.addEventListener("keydown", onKeydown);

    document.body.appendChild(root);
    window.setTimeout(() => root.classList.add("is-open"), 350);
  }

  function todayStr() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
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
})();
