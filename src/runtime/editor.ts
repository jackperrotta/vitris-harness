/** Preview-only click-to-edit overlay (injected when ?edit=1). */
export const editorCss = `.vitris-edit {
  position: relative;
  cursor: pointer;
  outline: 2px solid transparent;
  outline-offset: 2px;
  transition: outline-color 160ms ease;
}
.vitris-edit:hover,
.vitris-edit:focus-visible,
.vitris-edit.is-on {
  outline-color: #0891B2;
  z-index: 5;
}
.vitris-edit:has(.c-header) {
  position: sticky;
  top: 0;
  z-index: 22;
}
#vitris-cookie-banner { display: none !important; }
`;

export const editorJs = `(() => {
  const post = (payload) => {
    try { parent.postMessage(Object.assign({ vitris: "edit" }, payload), location.origin); }
    catch (_) {}
  };

  const bindOf = (el) => el && el.getAttribute("data-vitris-bind") || "";

  document.addEventListener("click", (event) => {
    const t = event.target;
    if (!(t instanceof Element)) return;
    const edit = t.closest(".vitris-edit");
    if (t.closest("a, button, [data-quotes-prev], [data-quotes-next], [data-stage-prev], [data-stage-next]")) {
      event.preventDefault();
    }
    if (t.closest("form")) event.preventDefault();
    if (!edit) return;
    event.preventDefault();
    event.stopPropagation();
    document.querySelectorAll(".vitris-edit.is-on").forEach((n) => n.classList.remove("is-on"));
    edit.classList.add("is-on");
    post({
      bind: bindOf(edit),
      component: edit.getAttribute("data-vitris-component") || "",
      id: edit.getAttribute("data-vitris-id") || "",
    });
  }, true);

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const t = event.target;
    if (!(t instanceof Element) || !t.classList.contains("vitris-edit")) return;
    event.preventDefault();
    t.click();
  });

  window.addEventListener("message", (event) => {
    if (event.origin !== location.origin) return;
    const data = event.data;
    if (!data || data.vitris !== "highlight") return;
    document.querySelectorAll(".vitris-edit.is-on").forEach((n) => n.classList.remove("is-on"));
    if (!data.bind) return;
    const el = document.querySelector('.vitris-edit[data-vitris-bind="' + CSS.escape(data.bind) + '"]');
    if (el) {
      el.classList.add("is-on");
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  });
})();
`;
