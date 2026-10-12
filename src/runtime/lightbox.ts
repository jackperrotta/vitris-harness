/** Gallery lightbox via <dialog>. */

export const lightboxJs = `(() => {
  const roots = [...document.querySelectorAll("[data-island=\\"lightbox\\"]")];
  for (const root of roots) {
    const dialog = root.querySelector("dialog");
    const img = dialog?.querySelector("img");
    if (!(dialog instanceof HTMLDialogElement) || !(img instanceof HTMLImageElement)) continue;

    root.querySelectorAll("[data-lightbox-src]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const src = btn.getAttribute("data-lightbox-src");
        const alt = btn.getAttribute("data-lightbox-alt") || "";
        if (!src) return;
        img.src = src;
        img.alt = alt;
        dialog.showModal();
      });
    });
    dialog.addEventListener("click", (e) => {
      if (e.target === dialog) dialog.close();
    });
    dialog.querySelector("[data-lightbox-close]")?.addEventListener("click", () => dialog.close());
  }
})();
`;
