(() => {
  const dataEl = document.getElementById("g-data");
  if (!dataEl) return;
  const data = JSON.parse(dataEl.textContent || "{}");
  const state = {};

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getPath(ctx, path) {
    if (path === ".") return ctx["."];
    let current = ctx;
    for (const part of path.split(".")) {
      if (current == null || typeof current !== "object") return undefined;
      current = current[part];
    }
    return current;
  }

  function asCtx(item, parent, index) {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      return { ...parent, ...item, ".": item, _index: index };
    }
    return { ...parent, ".": item, _index: index };
  }

  function applyIfs(template, ctx) {
    let out = "";
    let i = 0;
    while (i < template.length) {
      const slice = template.slice(i);
      const match = slice.match(/\{\{#if\s+([\w.]+)\}\}/);
      if (!match || match.index === undefined) {
        out += slice;
        break;
      }
      out += slice.slice(0, match.index);
      const innerStart = i + match.index + match[0].length;
      let depth = 1;
      let j = innerStart;
      let closeAt = -1;
      while (j < template.length) {
        const openAt = template.indexOf("{{#if ", j);
        const endAt = template.indexOf("{{/if}}", j);
        if (endAt === -1) break;
        if (openAt !== -1 && openAt < endAt) {
          depth += 1;
          j = openAt + 6;
          continue;
        }
        depth -= 1;
        if (depth === 0) {
          closeAt = endAt;
          break;
        }
        j = endAt + 7;
      }
      if (closeAt === -1) {
        out += slice.slice(match.index);
        break;
      }
      const value = getPath(ctx, match[1]);
      if (value != null && value !== "" && value !== false && !(Array.isArray(value) && value.length === 0)) {
        out += applyIfs(template.slice(innerStart, closeAt), ctx);
      }
      i = closeAt + "{{/if}}".length;
    }
    return out;
  }

  function interpolate(template, ctx) {
    let out = template.replace(/\{\{#list\s+([\w.]+)\}\}([\s\S]*?)\{\{\/list\}\}/g, (_m, path, inner) => {
      const value = getPath(ctx, path);
      if (!Array.isArray(value)) return "";
      return value.map((item, i) => interpolate(inner, asCtx(item, ctx, i))).join("");
    });

    out = applyIfs(out, ctx);

    out = out.replace(/\{\{#paras\s+([\w.]+)\}\}([\s\S]*?)\{\{\/paras\}\}/g, (_m, path, inner) => {
      const value = getPath(ctx, path);
      if (value == null) return "";
      const parts = String(value)
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean);
      return parts.map((p, i) => interpolate(inner, asCtx(p, ctx, i))).join("");
    });

    out = out.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, path) => {
      const value = getPath(ctx, path);
      if (value == null) return "";
      let text = String(value);
      if (text.startsWith("/stock/") && window.VitrisStock?.resolve) {
        text = window.VitrisStock.resolve(text);
      }
      return escapeHtml(text);
    });

    return out;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function emptyFromFields(fields) {
    const out = {};
    for (const field of fields || []) {
      out[field.key] = field.type === "list" ? [] : "";
    }
    return out;
  }

  function emptyItem(fields) {
    return emptyFromFields(fields);
  }

  function mergeProps(name, props) {
    const entry = data.catalog[name];
    const base = emptyFromFields(entry.schema.fields);
    const next = { ...base, ...clone(props || {}) };
    for (const field of entry.schema.fields) {
      if (field.type !== "list") continue;
      const rows = Array.isArray(next[field.key]) ? next[field.key] : [];
      next[field.key] = rows.map((row) => ({ ...emptyItem(field.itemFields), ...(row || {}) }));
    }
    return next;
  }

  function ctxFor(name) {
    return {
      ...state[name],
      formAction: "#",
      pagePath: "/",
      siteName: "Harbor & Hearth",
      sectionId: name,
    };
  }

  function renderPreview(name) {
    const article = document.getElementById(name);
    if (!article) return;
    const frame = article.querySelector("[data-frame]");
    const entry = data.catalog[name];
    if (!frame || !entry) return;
    frame.innerHTML = `<div data-reveal data-reveal-strength="editorial" data-reveal-from="up" data-reveal-stagger class="is-in">${interpolate(entry.html, ctxFor(name))}</div>`;
  }

  function setAt(obj, path, value) {
    const parts = path.split(".");
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      const key = parts[i];
      const next = parts[i + 1];
      const nextIsIndex = /^\d+$/.test(next);
      if (/^\d+$/.test(key)) {
        const idx = Number(key);
        if (!Array.isArray(cur)) return;
        if (cur[idx] == null) cur[idx] = nextIsIndex ? [] : {};
        cur = cur[idx];
      } else {
        if (cur[key] == null || typeof cur[key] !== "object") {
          cur[key] = nextIsIndex ? [] : {};
        }
        cur = cur[key];
      }
    }
    const last = parts[parts.length - 1];
    if (/^\d+$/.test(last) && Array.isArray(cur)) cur[Number(last)] = value;
    else cur[last] = value;
  }

  function control(field, path, value, name) {
    const wrap = document.createElement("label");
    wrap.className = "g-field";
    const title = document.createElement("span");
    title.className = "g-field__label";
    title.textContent = `${field.label} · ${field.key}`;
    wrap.append(title);

    if (field.type === "textarea") {
      const input = document.createElement("textarea");
      input.rows = 3;
      input.value = value ?? "";
      input.dataset.path = path;
      wrap.append(input);
      return wrap;
    }

    const row = document.createElement("div");
    row.className = "g-field__row";
    const input = document.createElement("input");
    input.type = "text";
    input.value = value ?? "";
    input.dataset.path = path;
    if (field.type === "url") input.inputMode = "url";
    row.append(input);
    if (field.type === "image" || field.type === "video") {
      wrap.classList.add("stock-field");
      input.dataset.stockKind = field.type;
      const thumb = document.createElement("img");
      thumb.className = "stock-thumb";
      thumb.alt = "";
      if (value) thumb.src = window.VitrisStock?.resolve?.(value) || value;
      else thumb.hidden = true;
      const lib = document.createElement("button");
      lib.type = "button";
      lib.className = "g-mini";
      lib.dataset.stockOpen = "";
      lib.dataset.stockKind = field.type;
      lib.textContent = "Library";
      const clear = document.createElement("button");
      clear.type = "button";
      clear.className = "g-mini";
      clear.textContent = "Clear";
      clear.addEventListener("click", () => {
        input.value = "";
        setAt(state[name], path, "");
        thumb.removeAttribute("src");
        thumb.hidden = true;
        renderPreview(name);
      });
      row.prepend(thumb);
      row.append(lib, clear);
    }
    wrap.append(row);
    return wrap;
  }

  function listEditor(field, name, rows) {
    const box = document.createElement("fieldset");
    box.className = "g-list";
    const legend = document.createElement("legend");
    legend.textContent = `${field.label} · ${field.key}`;
    box.append(legend);

    (rows || []).forEach((row, index) => {
      const item = document.createElement("div");
      item.className = "g-item";
      const head = document.createElement("div");
      head.className = "g-item__head";
      const label = document.createElement("strong");
      label.textContent = `Item ${index + 1}`;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "g-mini";
      remove.textContent = "Remove";
      remove.addEventListener("click", () => {
        state[name][field.key].splice(index, 1);
        paintEditor(name);
        renderPreview(name);
      });
      head.append(label, remove);
      item.append(head);
      for (const sub of field.itemFields || []) {
        item.append(control(sub, `${field.key}.${index}.${sub.key}`, row?.[sub.key] ?? "", name));
      }
      box.append(item);
    });

    const add = document.createElement("button");
    add.type = "button";
    add.className = "g-add";
    add.textContent = `Add ${field.label.toLowerCase()}`;
    add.addEventListener("click", () => {
      if (!Array.isArray(state[name][field.key])) state[name][field.key] = [];
      state[name][field.key].push(emptyItem(field.itemFields));
      paintEditor(name);
      renderPreview(name);
    });
    box.append(add);
    return box;
  }

  function paintEditor(name) {
    const article = document.getElementById(name);
    const form = article?.querySelector("[data-editor]");
    const entry = data.catalog[name];
    if (!form || !entry) return;
    form.replaceChildren();

    const presets = data.presets[name] || [];
    if (presets.length) {
      const bar = document.createElement("div");
      bar.className = "g-presets";
      const lab = document.createElement("span");
      lab.textContent = "Layouts";
      bar.append(lab);
      for (const preset of presets) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = preset.label;
        btn.addEventListener("click", () => {
          state[name] = mergeProps(name, preset.props);
          paintEditor(name);
          renderPreview(name);
        });
        bar.append(btn);
      }
      form.append(bar);
    }

    const reset = document.createElement("button");
    reset.type = "button";
    reset.className = "g-reset";
    reset.textContent = "Reset sample";
    reset.addEventListener("click", () => {
      state[name] = mergeProps(name, data.samples[name] || {});
      paintEditor(name);
      renderPreview(name);
    });
    form.append(reset);

    for (const field of entry.schema.fields) {
      if (field.type === "list") {
        form.append(listEditor(field, name, state[name][field.key]));
      } else {
        form.append(control(field, field.key, state[name][field.key] ?? "", name));
      }
    }
  }

  document.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return;
    const path = target.dataset.path;
    if (!path) return;
    const article = target.closest("[data-component]");
    const name = article?.getAttribute("data-component");
    if (!name || !state[name]) return;
    setAt(state[name], path, target.value);
    renderPreview(name);
  });

  document.addEventListener("submit", (event) => {
    if (event.target.closest?.("[data-frame]")) event.preventDefault();
  });

  if (data.stock && window.VitrisStock) {
    window.VitrisStock.catalog = data.stock;
  }

  const demoInput = document.getElementById("g-stock-url");
  const demoImg = document.getElementById("g-stock-preview");
  const demoVid = document.getElementById("g-stock-video");
  demoInput?.addEventListener("input", () => {
    const url = window.VitrisStock?.resolve?.(demoInput.value) || demoInput.value;
    const isVid = /\.mp4(\?|$)/i.test(url);
    if (demoImg) {
      demoImg.hidden = !url || isVid;
      if (url && !isVid) demoImg.src = url;
    }
    if (demoVid) {
      demoVid.hidden = !isVid;
      if (isVid) {
        demoVid.src = url;
        demoVid.play().catch(() => {});
      } else {
        demoVid.removeAttribute("src");
      }
    }
  });

  for (const name of data.names) {
    state[name] = mergeProps(name, data.samples[name] || {});
    paintEditor(name);
    renderPreview(name);
  }
})();
