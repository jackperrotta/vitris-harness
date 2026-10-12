(() => {
  if (!new URLSearchParams(location.search).get("sent")) return;
  document.querySelectorAll("form[data-lead-form]").forEach((form) => {
    if (form.previousElementSibling?.classList.contains("c-lead-ok")) return;
    const note = document.createElement("p");
    note.className = "c-lead-ok";
    note.setAttribute("role", "status");
    note.textContent = "Message sent. We will get back to you.";
    form.before(note);
  });
})();

(() => {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const nodes = [...document.querySelectorAll("[data-reveal]")];
  if (!nodes.length) return;

  const indexChildren = (el) => {
    if (!el.hasAttribute("data-reveal-stagger")) return;
    [...el.querySelectorAll("[data-reveal-child]")].forEach((child, i) => {
      child.style.setProperty("--i", String(i));
    });
  };

  const reveal = (el) => {
    indexChildren(el);
    el.classList.add("is-in");
  };

  const inView = (el) => {
    const r = el.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    return r.top < vh * 0.9 && r.bottom > 0;
  };

  for (const el of nodes) {
    if (inView(el)) reveal(el);
  }

  document.documentElement.classList.add("reveal-on");

  const pending = nodes.filter((el) => !el.classList.contains("is-in"));
  if (!pending.length) return;

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        reveal(entry.target);
        io.unobserve(entry.target);
      }
    },
    { rootMargin: "0px 0px -10% 0px", threshold: 0.1 },
  );

  for (const el of pending) io.observe(el);
})();
