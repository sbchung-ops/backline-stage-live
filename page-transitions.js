(() => {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const transitionMs = reduceMotion ? 0 : 220;

  const shouldTransition = (event, link) => {
    if (!link || event.defaultPrevented) return false;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
    if (link.target && link.target !== "_self") return false;
    if (link.hasAttribute("download")) return false;

    const href = link.getAttribute("href");
    if (!href || href.startsWith("#")) return false;

    const nextUrl = new URL(link.href, window.location.href);
    if (nextUrl.origin !== window.location.origin) return false;
    if (!/\.html$|\/$/.test(nextUrl.pathname)) return false;
    if (nextUrl.pathname === window.location.pathname && nextUrl.hash) return false;

    return nextUrl.href !== window.location.href;
  };

  document.addEventListener("click", (event) => {
    const link = event.target.closest("a[href]");
    if (!shouldTransition(event, link)) return;

    event.preventDefault();
    document.body.classList.add("is-page-leaving");
    window.setTimeout(() => {
      window.location.href = link.href;
    }, transitionMs);
  });
})();
