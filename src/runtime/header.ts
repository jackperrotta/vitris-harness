/** Sticky header scroll state + mobile drawer. */

export const headerJs = `(() => {
  const headers = [...document.querySelectorAll("[data-island=\\"header\\"]")];
  if (!headers.length) return;

  const onScroll = () => {
    const scrolled = window.scrollY > 8;
    for (const el of headers) el.classList.toggle("is-scrolled", scrolled);
  };
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  for (const root of headers) {
    const toggle = root.querySelector("[data-nav-toggle]");
    const drawer = root.querySelector(".nav-drawer");
    const panel = root.querySelector(".nav-drawer__panel");
    if (!toggle || !drawer || !panel) continue;

    const close = () => {
      drawer.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
      document.body.style.overflow = "";
    };
    const open = () => {
      drawer.classList.add("is-open");
      toggle.setAttribute("aria-expanded", "true");
      document.body.style.overflow = "hidden";
      const focusable = panel.querySelector("a,button,[tabindex]:not([tabindex='-1'])");
      if (focusable instanceof HTMLElement) focusable.focus();
    };

    toggle.addEventListener("click", () => {
      if (drawer.classList.contains("is-open")) close();
      else open();
    });
    drawer.addEventListener("click", (e) => {
      if (e.target === drawer) close();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") close();
    });
    panel.querySelectorAll("a").forEach((a) => a.addEventListener("click", close));
  }
})();
`;
