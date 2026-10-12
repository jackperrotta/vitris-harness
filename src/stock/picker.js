(() => {
  const existing = window.VitrisStock;
  const state = {
    catalog: existing?.catalog || { version: 1, items: [] },
    base: existing?.base || "",
    kind: "image",
    query: "",
    category: "all",
    role: "", orientation: "", negativeSpace: "",
    onSelect: null,
  };

  function resolve(path) {
    if (!path) return "";
    if (/^https?:/i.test(path) || path.startsWith("data:")) return path;
    const rel = path.replace(/^\//, "");
    if (state.base) {
      const base = state.base.endsWith("/") ? state.base : `${state.base}/`;
      return new URL(rel, base).href;
    }
    if (location.protocol === "file:" || /\.html?$/i.test(location.pathname)) {
      return new URL(rel, new URL(".", location.href)).href;
    }
    return `${location.origin}/${rel}`;
  }

  function ensureDialog() {
    let dialog = document.querySelector(".stock-dialog");
    if (dialog) return dialog;
    dialog = document.createElement("dialog");
    dialog.className = "stock-dialog";
    dialog.innerHTML = `<form method="dialog" class="stock-dialog__bar">
        <input type="search" name="q" placeholder="Search the stock library" aria-label="Search stock">
        <button type="submit" value="close">Close</button>
      </form>
      <div class="stock-filters">
        <label>Use <select name="role"><option value="">Any</option><option>hero</option><option>context</option><option>detail</option><option>atmosphere</option></select></label>
        <label>Shape <select name="orientation"><option value="">Any</option><option>landscape</option><option>portrait</option><option>square</option></select></label>
        <label>Text space <select name="negativeSpace"><option value="">Any</option><option>left</option><option>right</option><option>top</option><option>all</option></select></label>
      </div>
      <div class="stock-chips" role="tablist" aria-label="Categories"></div>
      <div class="stock-grid"></div>`;
    document.body.append(dialog);
    dialog.querySelector("input[name=q]").addEventListener("input", (event) => {
      state.query = event.target.value.trim().toLowerCase();
      paint();
    });
    for (const select of dialog.querySelectorAll("select")) select.addEventListener("change", () => { state[select.name] = select.value; paint(); });
    return dialog;
  }

  function items() {
    if (window.VitrisStockSearch) return window.VitrisStockSearch(state.catalog.items || [], {text: state.query, kind: state.kind, industry: state.category === "all" ? undefined : state.category, role: state.role || undefined, orientation: state.orientation || undefined, negativeSpace: state.negativeSpace || undefined});
    const q = state.query;
    return (state.catalog.items || []).filter((item) => {
      if (state.kind && item.kind !== state.kind) return false;
      if (state.category !== "all" && !(item.categories || []).includes(state.category)) return false;
      if (!q) return true;
      const blob = `${item.alt} ${item.id} ${(item.tags || []).join(" ")} ${(item.categories || []).join(" ")}`.toLowerCase();
      return blob.includes(q);
    });
  }

  function paint() {
    const dialog = ensureDialog();
    const chips = dialog.querySelector(".stock-chips");
    const grid = dialog.querySelector(".stock-grid");
    const cats = new Set(["all"]);
    for (const item of state.catalog.items || []) {
      if (state.kind && item.kind !== state.kind) continue;
      if (item.status === "excluded" || item.status === "staged") continue;
      for (const cat of item.inspection?.industries || item.categories || []) cats.add(cat);
    }
    chips.replaceChildren(
      ...[...cats].map((cat) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = cat;
        btn.setAttribute("aria-pressed", String(cat === state.category));
        btn.addEventListener("click", () => {
          state.category = cat;
          paint();
        });
        return btn;
      }),
    );
    const rows = items();
    if (!rows.length) {
      grid.innerHTML = `<p class="stock-empty">No matching stock yet. Run <code>npm run stock</code> with a Pexels API key to fill the library.</p>`;
      return;
    }
    grid.replaceChildren(
      ...rows.map((item) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "stock-card";
        const media = document.createElement(item.kind === "video" ? "video" : "img");
        media.src = resolve(item.kind === "video" ? item.src : item.thumb || item.src);
        media.alt = item.alt || "";
        if (item.kind === "video") {
          media.muted = true;
          media.loop = true;
          media.playsInline = true;
          media.poster = resolve(item.thumb); media.preload = "none";
          btn.addEventListener("pointerenter", () => { if (!matchMedia("(prefers-reduced-motion: reduce)").matches) media.play().catch(() => {}); });
          btn.addEventListener("pointerleave", () => media.pause());
        }
        const cap = document.createElement("span");
        cap.textContent = item.inspection?.description || item.alt || item.id;
        btn.append(media, cap);
        btn.addEventListener("click", () => {
          state.onSelect?.(item.src, item);
          dialog.close();
        });
        return btn;
      }),
    );
  }

  async function load() {
    // Prefer the published catalog; the embedded copy is the offline fallback.
    try {
      const res = await fetch(`${state.base.replace(/\/$/, "")}/stock/catalog.json`, { credentials: "same-origin" });
      if (res.ok) state.catalog = await res.json();
    } catch {
      /* gallery may embed the catalog instead */
    }
  }

  window.VitrisStock = {
    get catalog() {
      return state.catalog;
    },
    set catalog(value) {
      state.catalog = value || { version: 1, items: [] };
    },
    get base() {
      return state.base;
    },
    set base(value) {
      state.base = value || "";
    },
    resolve,
    async open(opts) {
      state.kind = opts?.kind === "video" ? "video" : "image";
      state.category = "all";
      state.role = ""; state.orientation = ""; state.negativeSpace = "";
      state.query = "";
      state.onSelect = opts?.onSelect || null;
      await load();
      const dialog = ensureDialog();
      const search = dialog.querySelector("input[name=q]");
      for (const select of dialog.querySelectorAll("select")) select.value = "";
      search.value = "";
      paint();
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
      search.focus();
    },
    bind(root) {
      (root || document).addEventListener("click", (event) => {
        const btn = event.target.closest("[data-stock-open]");
        if (!btn) return;
        event.preventDefault();
        const wrap = btn.closest(".stock-field") || btn.parentElement;
        const input = wrap?.querySelector("input, textarea");
        const kind = btn.getAttribute("data-stock-kind") || input?.dataset.stockKind || "image";
        window.VitrisStock.open({
          kind,
          onSelect(url, item) {
            if (!input) return;
            input.value = url;
            input.dispatchEvent(new Event("input", { bubbles: true }));
            input.dispatchEvent(new Event("change", { bubbles: true }));
            const thumb = wrap.querySelector(".stock-thumb");
            if (thumb) {
              thumb.src = item?.thumb ? resolve(item.thumb) : url;
              thumb.hidden = !thumb.src;
            }
          },
        });
      });
    },
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => window.VitrisStock.bind(document), { once: true });
  } else {
    window.VitrisStock.bind(document);
  }
})();
