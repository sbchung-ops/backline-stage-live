// Use URL parsing, not HTML escaping, to reject executable URL schemes.
export function safeHref(value, {allowContact = false} = {}) {
  const href = String(value ?? "").trim();
  if (!href || /[\u0000-\u001f\u007f]/.test(href)) return "";
  try {
    const url = new URL(href, "https://backline.co.kr/");
    const allowed = ["https:", "http:"];
    if (allowContact) allowed.push("mailto:", "tel:");
    return allowed.includes(url.protocol) ? href : "";
  } catch {
    return "";
  }
}
