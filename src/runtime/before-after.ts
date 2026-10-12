/** Draggable before/after compare slider. */

export const beforeAfterJs = `(() => {
  const roots = [...document.querySelectorAll("[data-island=\\"before-after\\"]")];
  for (const root of roots) {
    if (!(root instanceof HTMLElement)) continue;
    const after = root.querySelector(".before-after__after");
    const handle = root.querySelector(".before-after__handle");
    if (!(after instanceof HTMLElement) || !(handle instanceof HTMLElement)) continue;

    let dragging = false;
    const setPos = (clientX) => {
      const rect = root.getBoundingClientRect();
      const pct = Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100));
      after.style.clipPath = \`inset(0 0 0 \${pct}%)\`;
      handle.style.left = \`\${pct}%\`;
      root.setAttribute("aria-valuenow", String(Math.round(pct)));
    };

    const onMove = (e) => {
      if (!dragging) return;
      const x = "touches" in e ? e.touches[0].clientX : e.clientX;
      setPos(x);
    };
    const stop = () => { dragging = false; };

    root.addEventListener("pointerdown", (e) => {
      dragging = true;
      root.setPointerCapture?.(e.pointerId);
      setPos(e.clientX);
    });
    root.addEventListener("pointermove", onMove);
    root.addEventListener("pointerup", stop);
    root.addEventListener("pointercancel", stop);
    root.addEventListener("keydown", (e) => {
      if (!(e instanceof KeyboardEvent)) return;
      const now = Number(root.getAttribute("aria-valuenow") || "50");
      if (e.key === "ArrowLeft") setPos(root.getBoundingClientRect().left + ((now - 5) / 100) * root.clientWidth);
      if (e.key === "ArrowRight") setPos(root.getBoundingClientRect().left + ((now + 5) / 100) * root.clientWidth);
    });
    root.setAttribute("role", "slider");
    root.setAttribute("aria-valuemin", "0");
    root.setAttribute("aria-valuemax", "100");
    root.setAttribute("aria-valuenow", "50");
    root.tabIndex = 0;
  }
})();
`;
