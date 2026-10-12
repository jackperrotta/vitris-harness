/** ARIA tabs. */

export const tabsJs = `(() => {
  const roots = [...document.querySelectorAll("[data-island=\\"tabs\\"]")];
  for (const root of roots) {
    const tabs = [...root.querySelectorAll("[role=\\"tab\\"]")];
    const panels = [...root.querySelectorAll("[role=\\"tabpanel\\"]")];
    if (!tabs.length) continue;

    const select = (tab) => {
      for (const t of tabs) {
        const on = t === tab;
        t.setAttribute("aria-selected", on ? "true" : "false");
        t.tabIndex = on ? 0 : -1;
      }
      const id = tab.getAttribute("aria-controls");
      for (const p of panels) {
        p.hidden = p.id !== id;
      }
    };

    tabs.forEach((tab, i) => {
      tab.addEventListener("click", () => select(tab));
      tab.addEventListener("keydown", (e) => {
        if (!(e instanceof KeyboardEvent)) return;
        let next = i;
        if (e.key === "ArrowRight") next = (i + 1) % tabs.length;
        if (e.key === "ArrowLeft") next = (i - 1 + tabs.length) % tabs.length;
        if (next !== i) {
          e.preventDefault();
          tabs[next].focus();
          select(tabs[next]);
        }
      });
    });
    const initial = tabs.find((t) => t.getAttribute("aria-selected") === "true") || tabs[0];
    select(initial);
  }
})();
`;
