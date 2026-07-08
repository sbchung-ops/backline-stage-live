(() => {
  const grid = document.querySelector("#ig-feed");
  if (!grid) return;

  // 고정 6칸 그리드를 유지하기 위해 기존 .ig-cell 을 in-place 로 갱신한다.
  // 게시물이 6개보다 적으면 남는 칸은 정적 placeholder 그대로 둔다.
  const cells = [...grid.querySelectorAll(".ig-cell")];
  if (!cells.length) return;

  init();

  async function init() {
    try {
      const res = await fetch("./assets/instagram-posts.json", { cache: "no-store" });
      if (!res.ok) return; // 데이터가 없으면 HTML placeholder 유지
      const data = await res.json();
      const posts = Array.isArray(data.posts) ? data.posts.filter((post) => post?.image) : [];
      if (!posts.length) return;
      apply(posts, data);
    } catch {
      // 네트워크/파싱 실패 시에도 placeholder 유지
    }
  }

  function apply(posts, data) {
    cells.forEach((cell, index) => {
      const post = posts[index];
      if (post) {
        updateCell(cell, post);
        cell.hidden = false;
      } else {
        cell.hidden = true; // 게시물보다 많은 칸은 더미 대신 숨김
      }
    });
    grid.hidden = false; // 실제 게시물이 있을 때만 노출(기본 hidden)
    grid.dataset.source = data.provider || "instagram";
  }

  function updateCell(cell, post) {
    if (post.permalink) cell.href = post.permalink;

    const image = cell.querySelector("img");
    if (image) {
      const fallback = image.getAttribute("src"); // 번들된 placeholder 로 되돌릴 대비
      image.onerror = () => {
        image.onerror = null;
        if (fallback) image.src = fallback;
      };
      image.src = post.image;
      image.alt = post.caption ? post.caption.slice(0, 60) : "";
    }

    const tag = cell.querySelector(".ig-tag");
    if (tag) tag.textContent = post.mediaType === "VIDEO" ? "▶" : "IG";
  }
})();
