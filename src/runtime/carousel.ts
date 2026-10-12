/** Buttoned, no-autoplay carousel with scroll-snap. */

export const carouselJs = `(() => {
  const roots = [...document.querySelectorAll("[data-island=\\"carousel\\"]")];
  for (const root of roots) {
    const track = root.querySelector(".carousel__track");
    const prev = root.querySelector("[data-carousel-prev]");
    const next = root.querySelector("[data-carousel-next]");
    if (!(track instanceof HTMLElement)) continue;
    const step = () => Math.max(track.clientWidth * 0.85, 240);
    prev?.addEventListener("click", () => track.scrollBy({ left: -step(), behavior: "smooth" }));
    next?.addEventListener("click", () => track.scrollBy({ left: step(), behavior: "smooth" }));
    root.addEventListener("keydown", (e) => {
      if (!(e instanceof KeyboardEvent)) return;
      if (e.key === "ArrowLeft") track.scrollBy({ left: -step(), behavior: "smooth" });
      if (e.key === "ArrowRight") track.scrollBy({ left: step(), behavior: "smooth" });
    });
  }
})();
`;
